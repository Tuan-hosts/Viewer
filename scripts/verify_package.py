"""Check exactly the reviewed, deployable package; no external dependencies."""
from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'FILE_MANIFEST.json').read_text())
assert manifest['status'] == 'VALIDATED'
expected = {item['file'] for item in manifest['files']}
actual = {p.relative_to(root).as_posix() for p in (root / 'site').rglob('*') if p.is_file()}
assert actual == expected, 'Site inventory differs from reviewed package'
for item in manifest['files']:
    path = root / item['file']
    assert not path.is_symlink(), 'Symlinks are not allowed in the site'
    data = path.read_bytes()
    assert len(data) == item['bytes'], item['file']
    assert hashlib.sha256(data).hexdigest() == item['sha256'], item['file']
assert sum(item['bytes'] for item in manifest['files']) < 1_000_000_000
print(f"Verified {len(expected)} site files, including all 96 chromosome packets.")
