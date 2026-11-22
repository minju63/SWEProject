"""Offline-only checks: no Supabase client or live HTTP request is created."""

import base64
import hashlib
import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlsplit

import requests

import auto_collect as collector
from raw_collection import COMPARE_FIELDS, RawCapture, RawStore, review_candidate, run_raw_collection, safe_url


class FinanceStagingTests(unittest.TestCase):
    def test_raw_capture_keeps_unfiltered_api_page_and_deduplicates_retry(self):
        store = Mock()
        capture = RawCapture(store, "00000000-0000-0000-0000-000000000001", "private-key")
        response = requests.Response()
        response.status_code = 200
        response.headers["Content-Type"] = "application/json"
        response._content = json.dumps({"result": [{"plcyNo": "A", "region": "부산"},
                                                   {"plcyNo": "B", "region": "서울"}]}).encode()
        response.encoding = "utf-8"
        response.request = requests.Request("GET", collector.API_URL,
                                            params={"apiKeyNm": "private-key", "plcyNm": "장학"}).prepare()
        capture(response)
        capture(response)
        self.assertEqual(store.write.call_count, 1)
        table, saved = store.write.call_args.args
        self.assertEqual(table, "finance_raw_response")
        self.assertEqual(len(saved["raw_json"]["result"]), 2)
        self.assertNotIn("private-key", saved["request_url"])
        self.assertEqual(saved["body_size_bytes"], len(response.content))

        another_run = RawCapture(store, "00000000-0000-0000-0000-000000000002", "private-key")
        another_run(response)
        self.assertEqual(store.write.call_count, 2)
        self.assertNotEqual(store.write.call_args_list[0].args[1]["run_id"],
                            store.write.call_args_list[1].args[1]["run_id"])

    def test_large_response_is_not_truncated_before_storage(self):
        store = Mock()
        capture = RawCapture(store, "00000000-0000-0000-0000-000000000003", "key")
        response = requests.Response()
        response.status_code = 200
        response.headers["Content-Type"] = "application/json"
        response._content = json.dumps({"body": "x" * (2 * 1024 * 1024)}).encode()
        response.encoding = "utf-8"
        response.request = requests.Request("GET", collector.API_URL).prepare()
        capture(response)
        saved = store.write.call_args.args[1]
        self.assertEqual(saved["body_size_bytes"], len(response.content))
        self.assertEqual(len(saved["raw_json"]["body"]), 2 * 1024 * 1024)

    def test_undecodable_html_keeps_original_bytes(self):
        store = Mock()
        capture = RawCapture(store, "00000000-0000-0000-0000-000000000004", "key")
        response = requests.Response()
        response.status_code = 200
        response.headers["Content-Type"] = "text/html"
        response._content = b"<html>\xff</html>"
        response.encoding = "utf-8"
        response.request = requests.Request("GET", "https://example.org/notice").prepare()
        capture(response)
        saved = store.write.call_args.args[1]
        self.assertEqual(base64.b64decode(saved["raw_base64"]), response.content)
        self.assertEqual(saved["response_sha256"], hashlib.sha256(response.content).hexdigest())

    def test_eligibility_remains_unverified_with_source_and_raw_hints(self):
        row = {"지원대상_원문": "부산 거주 청년", "제외대상": "타 사업 수혜자",
               "소득조건": "중위소득 100% 이하", "거주조건_원문": "부산 거주",
               "원문URL": "https://example.org/notice"}
        rules, verified = collector.build_eligibility_v12(row)
        self.assertFalse(verified)
        self.assertEqual(rules["logic"], "UNVERIFIED")
        self.assertEqual(rules["required"][0]["operator"], "RAW")
        self.assertEqual(rules["exclusions"][0]["operator"], "RAW")
        self.assertEqual(rules["required"][0]["source_url"], row["원문URL"])
        self.assertEqual(rules["structured_hints"]["income_raw"]["text"], row["소득조건"])

    def test_document_keys_are_stable_and_existing_objects_survive(self):
        source = "https://example.org/notice"
        strings = ["주민등록등본", "해당자만: 재학증명서", "주민등록등본"]
        first = collector.document_items_for_review_v17(strings, source)
        second = collector.document_items_for_review_v17(strings, source)
        self.assertEqual(first, second)
        self.assertEqual(len(first), 2)
        self.assertFalse(first[1]["required"])
        self.assertFalse(first[0]["confirmed"])
        verified = {"key": "d1", "name": "기존 서류", "required": True, "confirmed": True}
        self.assertEqual(collector.document_items_for_review_v17([verified]), [verified])

    def test_application_method_is_not_expanded_into_invented_steps(self):
        extracted = collector.extract_application_fields_v12(api={"plcyAplyMthdCn": "온라인 신청"})
        self.assertEqual(extracted["application_process"], ["온라인 신청"])
        self.assertIsNone(extracted["required_documents"])

    def test_review_projection_never_marks_eligibility_verified(self):
        row = {"정책명": "예시", "신청범위": "전국", "원문URL": "https://example.org",
               "eligibility_conditions": '{"required":[],"logic":"UNVERIFIED"}',
               "eligibility_verified": "true", "application_process": '["온라인 신청"]',
               "required_documents": '[{"key":"d1","name":"신청서"}]'}
        projected = review_candidate(collector, row)
        self.assertFalse(projected["eligibility_verified"])
        self.assertEqual(projected["application_process"], ["온라인 신청"])
        self.assertEqual(projected["required_documents"][0]["key"], "d1")

    def test_write_allowlist_blocks_policy_tables(self):
        store = object.__new__(RawStore)
        with self.assertRaises(ValueError):
            store.write("policy", {})
        with self.assertRaises(ValueError):
            store.write("finance_detail", {})
        self.assertEqual(safe_url("https://example.org/a?token=secret&x=1"),
                         "https://example.org/a?x=1")

    def test_postgrest_duplicate_ignore_and_run_update_request_shape(self):
        store = object.__new__(RawStore)
        store.base_url = "https://test.example/rest/v1/"
        store.session = Mock()
        store.session.post.return_value.ok = True
        store.session.patch.return_value.ok = True
        store.write("finance_raw_response", {"run_id": "run-1"},
                    conflict="run_id,request_fingerprint,response_sha256,http_status")
        insert = store.session.post.call_args
        self.assertEqual(insert.kwargs["params"]["on_conflict"],
                         "run_id,request_fingerprint,response_sha256,http_status")
        self.assertIn("ignore-duplicates", insert.kwargs["headers"]["Prefer"])
        store.write("finance_raw_run", {"status": "SUCCESS"}, run_id="run-1")
        update = store.session.patch.call_args
        self.assertEqual(update.kwargs["params"], {"run_id": "eq.run-1"})

    def test_existing_policy_comparison_uses_youth_id_and_get_only(self):
        class ReadOnlyStore(RawStore):
            def __init__(self):
                self.calls = []

            def read(self, table, *, params):
                self.calls.append((table, params))
                if table == "policy_source":
                    return [{"policy_id": "policy-1"}] if params["external_id"] == "eq.YOUTH-123" else []
                return [{"policy_id": "policy-1", "collection_domain": "FINANCE",
                         "target_summary": "학생"}]

        store = ReadOnlyStore()
        status, policy_id, changed = store.compare("123", None, {"target_summary": "학생"})
        self.assertEqual((status, policy_id), ("SAME", "policy-1"))
        self.assertNotIn("target_summary", changed)
        self.assertTrue(all(table in {"policy", "policy_source"} for table, _ in store.calls))

    def test_comparison_distinguishes_new_changed_and_same(self):
        class FakeStore(RawStore):
            def __init__(self, existing):
                self.existing = existing

            def read(self, table, *, params):
                if table == "policy_source":
                    return [] if self.existing is None else [{"policy_id": "policy-1"}]
                return [] if self.existing is None else [self.existing]

        candidate = {field: None for field in COMPARE_FIELDS}
        candidate["target_summary"] = "학생"
        self.assertEqual(FakeStore(None).compare("123", None, candidate)[0], "NO_EXACT_MATCH")
        existing = {"collection_domain": "FINANCE", **candidate}
        self.assertEqual(FakeStore(existing).compare("123", None, candidate)[0], "SAME")
        existing["target_summary"] = "졸업생"
        status, _, changed = FakeStore(existing).compare("123", None, candidate)
        self.assertEqual((status, changed), ("DIFFERENT", ["target_summary"]))

    def test_comparison_leaves_ambiguous_and_nonfinance_matches_for_review(self):
        class FakeStore(RawStore):
            def __init__(self, source_ids, policy_rows):
                self.source_ids, self.policy_rows = source_ids, policy_rows

            def read(self, table, *, params):
                if table == "policy_source":
                    return [{"policy_id": value} for value in self.source_ids]
                return self.policy_rows

        self.assertEqual(FakeStore(["p1", "p2"], []).compare("123", None, {})[0],
                         "AMBIGUOUS_MATCH")
        self.assertEqual(FakeStore(["p1"], [{"collection_domain": "OTHER"}])
                         .compare("123", None, {})[0], "LOOKUP_INCOMPLETE")

    def test_api_retries_rate_limit_and_timeout_within_bound(self):
        rate_limited = Mock(status_code=429)
        success = Mock(status_code=200)
        success.json.return_value = {"result": []}
        session = Mock()
        session.get.side_effect = [rate_limited, requests.Timeout("simulated"), success]
        with patch.object(collector.time, "sleep") as sleeping:
            result = collector.YouthPolicyAPI("test-key", session)._request({"pageType": 1})
        self.assertEqual(result, {"result": []})
        self.assertEqual(session.get.call_count, 3)
        self.assertEqual(sleeping.call_count, 3)

    def test_failure_marks_run_failed_and_records_error(self):
        class FailingAPI:
            def __init__(self, _key, _session):
                self.discovery_exclusions = []

            def search_pages(self, *_args, **_kwargs):
                return []

            def detail(self, *_args, **_kwargs):
                return None

            def discover_finance_policies(self, **_kwargs):
                raise RuntimeError("simulated discovery failure")

        store = Mock()
        with patch.object(collector, "YouthPolicyAPI", FailingAPI), \
             patch.object(collector, "load_youthcenter_api_keys", return_value={"policy": "test-key"}):
            with self.assertRaises(RuntimeError):
                run_raw_collection(collector, store=store)
        tables = [call.args[0] for call in store.write.call_args_list]
        self.assertEqual(tables, ["finance_raw_run", "finance_raw_error", "finance_raw_run"])
        self.assertEqual(store.write.call_args_list[-1].args[1]["status"], "FAILED")

    def test_one_policy_failure_keeps_other_policy_and_marks_partial(self):
        class FakeAPI:
            def __init__(self, _key, _session):
                self.discovery_exclusions = []

            def search_pages(self, *_args, **_kwargs):
                return []

            def detail(self, *_args, **_kwargs):
                return None

            def discover_finance_policies(self, **_kwargs):
                return [{"plcyNo": "broken"}, {"plcyNo": "ok"}]

        def collect(item, _session):
            if item["plcyNo"] == "broken":
                raise RuntimeError("simulated policy failure")
            return {"정책명": "정상 정책"}, {}

        store = Mock()
        with patch.object(collector, "YouthPolicyAPI", FakeAPI), \
             patch.object(collector, "load_youthcenter_api_keys", return_value={"policy": "test-key"}), \
             patch.object(collector, "collect_discovered_api_policy", side_effect=collect), \
             patch.object(collector, "LOCAL_INDEX_SOURCES", []), \
             patch.object(collector, "SUPPLEMENTAL_POLICY_SEEDS", []):
            run_raw_collection(collector, store=store)
        tables = [call.args[0] for call in store.write.call_args_list]
        self.assertEqual(tables, ["finance_raw_run", "finance_raw_error", "finance_raw_run"])
        self.assertEqual(store.write.call_args_list[-1].args[1]["status"], "PARTIAL")
        self.assertEqual(store.write.call_args_list[-1].args[1]["error_count"], 1)

    def test_review_run_writes_only_staging_tables(self):
        class FakeAPI:
            def __init__(self, _key, _session):
                self.discovery_exclusions = []

            def search_pages(self, *_args, **_kwargs):
                return []

            def detail(self, *_args, **_kwargs):
                return None

            def discover_finance_policies(self, **_kwargs):
                return [{"plcyNo": "123"}]

        row = collector.blank_row()
        row.update({"정책명": "테스트 장학금", "신청범위": "전국",
                    "원문URL": "https://example.org/notice", "지원대상_원문": "대학생",
                    "application_process": '["온라인 신청"]',
                    "required_documents": '["재학증명서"]'})
        store = Mock()
        store.compare.return_value = ("NO_EXACT_MATCH", None, [])
        with patch.object(collector, "YouthPolicyAPI", FakeAPI), \
             patch.object(collector, "load_youthcenter_api_keys", return_value={"policy": "test-key"}), \
             patch.object(collector, "collect_discovered_api_policy", return_value=(row, {})), \
             patch.object(collector, "LOCAL_INDEX_SOURCES", []), \
             patch.object(collector, "SUPPLEMENTAL_POLICY_SEEDS", []):
            run_raw_collection(collector, stage_review=True, store=store)
        tables = [call.args[0] for call in store.write.call_args_list]
        self.assertEqual(tables, ["finance_raw_run", "finance_review_candidate", "finance_raw_run"])
        saved = store.write.call_args_list[1].args[1]["normalized_data"]
        self.assertFalse(saved["eligibility_verified"])
        self.assertEqual(saved["required_documents"][0]["name"], "재학증명서")


class RestTransportTests(unittest.TestCase):
    """Loopback HTTP transport only; this is not a PostgreSQL/RLS test."""

    @classmethod
    def setUpClass(cls):
        cls.received = []

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def _handle(self):
                length = int(self.headers.get("Content-Length", "0"))
                body = self.rfile.read(length)
                RestTransportTests.received.append((self.command, self.path, dict(self.headers), body))
                if self.path.startswith("/rest/v1/finance_raw_error"):
                    self.send_response(504)
                    self.end_headers()
                elif self.command == "GET":
                    payload = b"[]"
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(payload)))
                    self.end_headers()
                    self.wfile.write(payload)
                else:
                    self.send_response(204)
                    self.end_headers()

            do_POST = do_PATCH = do_GET = _handle

        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.received.clear()
        self.store = RawStore(f"http://127.0.0.1:{self.server.server_port}", "test-only-key")

    def tearDown(self):
        self.store.session.close()

    def test_actual_http_write_read_and_large_json(self):
        large = "x" * (2 * 1024 * 1024)
        self.store.write("finance_raw_response", {"run_id": "test-run", "raw_json": {"body": large}},
                         conflict="run_id,request_fingerprint,response_sha256,http_status")
        self.store.write("finance_raw_run", {"status": "SUCCESS"}, run_id="test-run")
        self.assertEqual(self.store.read("policy", params={"select": "policy_id"}), [])
        post, patch, get = self.received
        self.assertEqual([post[0], patch[0], get[0]], ["POST", "PATCH", "GET"])
        self.assertEqual(urlsplit(post[1]).path, "/rest/v1/finance_raw_response")
        self.assertEqual(parse_qs(urlsplit(post[1]).query)["on_conflict"],
                         ["run_id,request_fingerprint,response_sha256,http_status"])
        self.assertIn("ignore-duplicates", post[2]["Prefer"])
        self.assertEqual(len(json.loads(post[3])["raw_json"]["body"]), 2 * 1024 * 1024)
        self.assertEqual(parse_qs(urlsplit(patch[1]).query)["run_id"], ["eq.test-run"])
        self.assertEqual(get[2]["Authorization"], "Bearer test-only-key")

    def test_http_failure_and_storage_timeout_propagate(self):
        with self.assertRaisesRegex(RuntimeError, "HTTP 504"):
            self.store.write("finance_raw_error", {"run_id": "test-run"})
        with patch.object(self.store.session, "post", side_effect=requests.Timeout("simulated")):
            with self.assertRaises(requests.Timeout):
                self.store.write("finance_raw_response", {"run_id": "test-run"})


if __name__ == "__main__":
    unittest.main()
