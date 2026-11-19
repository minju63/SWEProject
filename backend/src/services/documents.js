// 신청 준비물(서류) 목록: 정책 상세의 공식 준비물 + 마이 신청 준비에서 직접 추가한 준비물
// 마이와 같은 규칙: 공식 준비물은 문자열 또는 { key, name, required }, 직접 추가한 준비물과 key 없는 공식 준비물은 'custom:<이름>' 키로 user_document_check 에 저장된다.
export function officialDocuments(policy) {
  let raw = policy?.required_documents;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = [];
    }
  }
  return (Array.isArray(raw) ? raw : []).flatMap((d) => {
    if (typeof d === 'string' && d.trim()) return [{ name: d.trim() }];
    if (d && typeof d === 'object' && typeof d.name === 'string' && d.name.trim())
      return [{ key: d.key, name: d.name.trim(), required: d.required }];
    return [];
  });
}

const customKey = (name) => `custom:${encodeURIComponent(name)}`;

// rows: 이 사용자의 user_document_check 행 중 이 정책의 것 [{ doc_key, is_checked }]
export function buildDocuments(policy, rows = []) {
  const byKey = new Map(rows.map((r) => [r.doc_key, r]));
  const official = officialDocuments(policy).map((d) => {
    const key = d.key ?? customKey(d.name);
    return { key, name: d.name, custom: false, required: d.required !== false, checked: byKey.get(key)?.is_checked === true };
  });
  const names = new Set(official.map((d) => d.name));
  const added = [];
  for (const r of rows) {
    if (!r.doc_key?.startsWith('custom:')) continue;
    let name;
    try {
      name = decodeURIComponent(r.doc_key.slice(7));
    } catch {
      continue;
    }
    if (!name || names.has(name)) continue; // 공식 준비물과 이름이 같으면 이미 위에서 센다
    names.add(name);
    added.push({ key: r.doc_key, name, custom: true, required: true, checked: r.is_checked === true });
  }
  return [...official, ...added];
}
