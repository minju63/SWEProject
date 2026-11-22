"""Capture HTTP responses before filtering, with optional review-only projections.

The only write targets are the finance_raw_* and finance_review_candidate tables.
No code path here calls the legacy policy/finance_detail sync.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
from datetime import datetime
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from uuid import uuid4

import requests


SECRET_QUERY_KEYS = {"apikeynm", "apikey", "api_key", "key", "token", "access_token", "secret"}
WRITE_TABLES = {"finance_raw_run", "finance_raw_response", "finance_raw_error", "finance_review_candidate"}
COMPARE_FIELDS = ("target_summary", "eligibility_conditions", "eligibility_verified",
                  "application_method", "application_process", "required_documents")


def safe_url(url: str) -> str:
    parts = urlsplit(url)
    query = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True)
             if key.lower() not in SECRET_QUERY_KEYS]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), ""))


def safe_error(message: str, api_key: str) -> str:
    if api_key:
        message = message.replace(api_key, "[REDACTED]")
    return re.sub(r"(?i)(apiKeyNm|api_key|apikey|access_token|token|secret)=([^&\s]+)",
                  r"\1=[REDACTED]", message)[:1000]


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


class RawStore:
    """Server-side REST client with an explicit write allowlist."""

    def __init__(self, url: str, key: str):
        if not url or not key:
            raise RuntimeError("raw capture requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
        self.base_url = url.rstrip("/") + "/rest/v1/"
        self.session = requests.Session()
        self.session.headers.update({
            "apikey": key, "Authorization": f"Bearer {key}",
            "Content-Type": "application/json", "Prefer": "return=minimal",
        })

    def write(self, table: str, data: dict, *, run_id: str | None = None,
              conflict: str | None = None) -> None:
        if table not in WRITE_TABLES:
            raise ValueError("collector may only write staging tables")
        if run_id:
            if table != "finance_raw_run":
                raise ValueError("only a run can be updated")
            response = self.session.patch(self.base_url + table,
                                          params={"run_id": "eq." + run_id}, json=data, timeout=30)
        else:
            headers = {"Prefer": "resolution=ignore-duplicates,return=minimal"} if conflict else None
            response = self.session.post(self.base_url + table,
                                         params={"on_conflict": conflict} if conflict else None,
                                         json=data, headers=headers, timeout=30)
        if not response.ok:
            raise RuntimeError(f"staging write to {table} failed: HTTP {response.status_code}")

    def read(self, table: str, *, params: dict) -> list[dict]:
        if table not in {"policy", "policy_source"}:
            raise ValueError("comparison may only read existing policy sources")
        response = self.session.get(self.base_url + table, params=params, timeout=30)
        if not response.ok:
            raise RuntimeError(f"read-only comparison from {table} failed: HTTP {response.status_code}")
        return response.json()

    def existing_run(self, scheduled_date: str, stage_review: bool) -> dict | None:
        response = self.session.get(self.base_url + "finance_raw_run", params={
            "select": "run_id,status", "scheduled_date": "eq." + scheduled_date,
            "review_enabled": "eq." + str(stage_review).lower(),
            "status": "in.(RUNNING,SUCCESS,PARTIAL)",
            "order": "started_at.desc", "limit": "1",
        }, timeout=30)
        if not response.ok:
            raise RuntimeError(f"staging run lookup failed: HTTP {response.status_code}")
        rows = response.json()
        return rows[0] if rows else None

    def compare(self, external_id: str | None, official_url: str | None,
                candidate: dict) -> tuple[str, str | None, list[str]]:
        ids: set[str] = set()
        if external_id:
            # Existing finance sources use both raw API ids and YOUTH-prefixed ids.
            for value in (external_id, "YOUTH-" + external_id):
                rows = self.read("policy_source", params={"select": "policy_id",
                                                          "external_id": "eq." + value})
                ids.update(str(row["policy_id"]) for row in rows if row.get("policy_id"))
        if not ids and official_url:
            rows = self.read("policy", params={"select": "policy_id",
                                               "official_url": "eq." + official_url,
                                               "collection_domain": "eq.FINANCE"})
            ids.update(str(row["policy_id"]) for row in rows if row.get("policy_id"))
        if not ids:
            return "NO_EXACT_MATCH", None, []
        if len(ids) != 1:
            return "AMBIGUOUS_MATCH", None, []
        policy_id = next(iter(ids))
        rows = self.read("policy", params={"select": "policy_id,collection_domain," + ",".join(COMPARE_FIELDS),
                                           "policy_id": "eq." + policy_id})
        if len(rows) != 1 or rows[0].get("collection_domain") != "FINANCE":
            return "LOOKUP_INCOMPLETE", None, []
        changed = [field for field in COMPARE_FIELDS if rows[0].get(field) != candidate.get(field)]
        return ("DIFFERENT" if changed else "SAME"), policy_id, changed


class RawCapture:
    def __init__(self, store: RawStore, run_id: str, api_key: str):
        self.store, self.run_id, self.api_key = store, run_id, api_key
        self.seen: set[tuple[str, str, int]] = set()
        self.response_count = 0
        self.storage_error: Exception | None = None

    def __call__(self, response: requests.Response, **_kwargs) -> requests.Response:
        try:
            request = response.request
            url = safe_url(request.url or response.url)
            parts = urlsplit(url)
            source_type = ("API" if (parts.hostname or "").lower() == "www.youthcenter.go.kr"
                           and parts.path == "/go/ythip/getPlcy" else "CRAWL")
            body = response.content  # response hook precedes JSON parsing, HTML cleanup, and filtering
            body_hash = digest(body)
            request_hash = digest(f"{request.method}:{url}".encode("utf-8"))
            identity = (request_hash, body_hash, response.status_code)
            if identity in self.seen:
                return response
            content_type = (response.headers.get("Content-Type") or "").lower()
            binary = "pdf" in content_type or url.lower().endswith(".pdf")
            encoding = response.encoding or ("utf-8" if source_type == "API" else response.apparent_encoding) or "utf-8"
            undecodable = False
            if binary:
                body_text = None
            else:
                try:
                    body_text = body.decode(encoding)
                except (UnicodeError, LookupError):
                    body_text = body.decode("utf-8", errors="replace")
                    encoding = "utf-8"
                    undecodable = True
            body_json = None
            if body_text is not None and ("json" in content_type or source_type == "API"):
                try:
                    body_json = json.loads(body_text)
                except ValueError:
                    pass  # XML and invalid JSON are still retained as response text
            query = dict(parse_qsl(parts.query, keep_blank_values=True))
            external_id = query.get("plcyNo") if source_type == "API" else None
            self.store.write("finance_raw_response", {
                "run_id": self.run_id, "fetched_at": datetime.now().astimezone().isoformat(),
                "source_type": source_type, "source_identifier": external_id or url,
                "external_id": external_id, "request_url": url,
                "request_fingerprint": request_hash, "http_status": response.status_code,
                "content_type": content_type[:200] or None, "body_encoding": encoding,
                "body_size_bytes": len(body), "response_sha256": body_hash,
                "raw_json": body_json, "raw_text": body_text,
                "raw_base64": base64.b64encode(body).decode("ascii") if binary or undecodable else None,
            }, conflict="run_id,request_fingerprint,response_sha256,http_status")
            self.seen.add(identity)
            self.response_count += 1
        except Exception as exc:
            self.storage_error = exc
            raise
        return response

    def check(self) -> None:
        if self.storage_error:
            raise self.storage_error


def review_candidate(collector, row: dict) -> dict:
    """A review projection only; it is never passed to the policy sync."""
    return {
        "collector_row": dict(row),
        "title": collector.clean_text(row.get("정책명")),
        "scope": collector.clean_text(row.get("신청범위")),
        "official_url": collector.normalize_source_url(row.get("원문URL")) or None,
        "target_summary": collector._safe_text_v12(row.get("지원대상_원문")),
        "eligibility_conditions": collector._json_col_v12(row.get("eligibility_conditions")),
        "eligibility_verified": False,
        "application_method": collector._safe_text_v12(row.get("신청방법")),
        "application_process": collector._json_col_v12(row.get("application_process")),
        "required_documents": collector._json_col_v12(row.get("required_documents")),
    }


def run_raw_collection(collector, *, max_pages: int = 6, stage_review: bool = False,
                       store: RawStore | None = None, skip_existing_day: bool = False,
                       fail_on_partial: bool = False) -> str:
    """Reuse the existing discovery/crawl scope, and optionally stage normalized candidates."""
    api_key = collector.load_youthcenter_api_keys().get("policy", "")
    if not api_key:
        raise RuntimeError("raw capture requires YOUTHCENTER_POLICY_API_KEY")
    store = store or RawStore(os.getenv("SUPABASE_URL", "").strip(),
                              os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip())
    scheduled_date = datetime.now(collector.KST).date().isoformat()
    if skip_existing_day:
        existing = store.existing_run(scheduled_date, stage_review)
        if existing:
            existing_id = existing["run_id"]
            if existing["status"] == "SUCCESS":
                print(f"[raw capture] already collected today (run_id={existing_id})")
                store.session.close()
                return existing_id
            store.session.close()
            raise RuntimeError(f"prior run needs review before retry (run_id={existing_id}, status={existing['status']})")
    run_id = str(uuid4())
    store.write("finance_raw_run", {
        "run_id": run_id, "started_at": datetime.now(collector.KST).isoformat(),
        "scheduled_date": scheduled_date,
        "status": "RUNNING", "response_count": 0, "error_count": 0,
        "review_enabled": stage_review,
    })
    capture = RawCapture(store, run_id, api_key)
    session = requests.Session()
    session.headers.update({
        "User-Agent": collector.USER_AGENT,
        "Accept": "application/json,text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.6",
    })
    session.hooks["response"].append(capture)
    counts = {"error": 0, "excluded": 0, "discovered": 0, "review": 0}
    rows: list[tuple[dict, str | None]] = []

    def record_error(stage: str, error: object, source_url: str = "") -> None:
        counts["error"] += 1
        store.write("finance_raw_error", {
            "run_id": run_id, "occurred_at": datetime.now(collector.KST).isoformat(),
            "stage": stage, "source_url": safe_url(source_url) if source_url else None,
            "error_message": safe_error(str(error), api_key),
        })

    def record_log(stage: str, log: dict) -> None:
        for message in log.get("errors") or []:
            record_error(stage, message, (log.get("crawl_urls") or [""])[0])

    fatal: Exception | None = None
    try:
        api = collector.YouthPolicyAPI(api_key, session)
        original_search, original_detail = api.search_pages, api.detail

        def tracked_search(*args, **kwargs):
            try:
                return original_search(*args, **kwargs)
            except Exception as exc:
                capture.check()
                record_error("API_SEARCH", exc)
                raise

        def tracked_detail(*args, **kwargs):
            try:
                return original_detail(*args, **kwargs)
            except Exception as exc:
                capture.check()
                record_error("API_DETAIL", exc)
                raise

        api.search_pages, api.detail = tracked_search, tracked_detail
        discovered = api.discover_finance_policies(max_pages=max_pages)
        capture.check()
        counts["discovered"] = len(discovered)
        counts["excluded"] = len(api.discovery_exclusions)
        for log in api.discovery_exclusions:
            record_log("API_DISCOVERY", log)
        names: set[str] = set()
        for item in discovered:
            try:
                row, log = collector.collect_discovered_api_policy(item, session)
                capture.check()
                names.add(collector.norm_name(row.get("정책명", "")))
                rows.append((row, collector.clean_text(item.get("plcyNo")) or None))
                record_log("API_POLICY", log)
            except Exception as exc:
                capture.check()
                record_error("API_POLICY", exc)
        for scope, index_url in collector.LOCAL_INDEX_SOURCES:
            try:
                links = collector.discover_index_finance_links(session, index_url)
                capture.check()
            except Exception as exc:
                capture.check()
                record_error("OFFICIAL_INDEX", exc, index_url)
                continue
            for name, url in links:
                if collector.norm_name(name) in names:
                    continue
                try:
                    row, log = collector.collect_local_index_policy(name, url, scope, session)
                    capture.check()
                    record_log("OFFICIAL_POLICY", log)
                    if row:
                        names.add(collector.norm_name(row.get("정책명", "")))
                        rows.append((row, None))
                except Exception as exc:
                    capture.check()
                    record_error("OFFICIAL_POLICY", exc, url)
        for seed in collector.SUPPLEMENTAL_POLICY_SEEDS:
            if collector.norm_name(seed.name) in names:
                continue
            try:
                row, log = collector.collect_one(seed, None, session)
                capture.check()
                record_log("SUPPLEMENTAL_POLICY", log)
                names.add(collector.norm_name(row.get("정책명", "")))
                rows.append((row, None))
            except Exception as exc:
                capture.check()
                record_error("SUPPLEMENTAL_POLICY", exc, seed.official_url or "")

        if stage_review:
            for row, external_id in rows:
                try:
                    collector.improve_extracts_v14(row)
                    collector.improve_extracts_v15(row)
                    collector.improve_extracts_v16(row)
                    collector.apply_profile_columns(row)
                    collector.apply_post_dedupe_v12(row)
                    candidate = review_candidate(collector, row)
                    try:
                        status, existing_id, changed = store.compare(external_id,
                                                                      candidate["official_url"], candidate)
                    except Exception as exc:
                        record_error("REVIEW_COMPARE", exc, row.get("원문URL", ""))
                        status, existing_id, changed = "LOOKUP_INCOMPLETE", None, []
                    normalized_hash = digest(json.dumps(
                        {key: candidate.get(key) for key in
                         ("title", "scope", "official_url", *COMPARE_FIELDS)},
                        ensure_ascii=False, sort_keys=True).encode("utf-8"))
                    fingerprint = digest(json.dumps([external_id, candidate["title"],
                                                     candidate["scope"], candidate["official_url"],
                                                     normalized_hash],
                                                    ensure_ascii=False).encode("utf-8"))
                    store.write("finance_review_candidate", {
                        "run_id": run_id, "candidate_fingerprint": fingerprint,
                        "source_identifier": external_id or candidate["official_url"] or candidate["title"],
                        "external_id": external_id,
                        "normalized_data": candidate,
                        "normalized_sha256": normalized_hash,
                        "existing_policy_id": existing_id,
                        "comparison_status": status, "changed_fields": changed,
                        "review_status": "PENDING",
                    }, conflict="run_id,candidate_fingerprint")
                    counts["review"] += 1
                except Exception as exc:
                    record_error("REVIEW_STAGE", exc, row.get("원문URL", ""))
    except Exception as exc:
        fatal = exc
        if not capture.storage_error:
            try:
                record_error("RUN", exc)
            except Exception:
                pass
    finally:
        session.close()
        try:
            store.write("finance_raw_run", {
                "finished_at": datetime.now(collector.KST).isoformat(),
                "status": "FAILED" if fatal else "PARTIAL" if counts["error"] else "SUCCESS",
                "response_count": capture.response_count, "error_count": counts["error"],
                "discovered_count": counts["discovered"],
                "excluded_count": counts["excluded"], "review_count": counts["review"],
            }, run_id=run_id)
        finally:
            store.session.close()
    if fatal:
        raise RuntimeError(f"raw capture failed (run_id={run_id})") from None
    print(f"[raw capture] run_id={run_id}, responses={capture.response_count}, "
          f"errors={counts['error']}, discovered={counts['discovered']}, "
          f"excluded={counts['excluded']}, review={counts['review']}")
    if counts["error"] and fail_on_partial:
        raise RuntimeError(f"raw capture partial (run_id={run_id}, errors={counts['error']})")
    return run_id

