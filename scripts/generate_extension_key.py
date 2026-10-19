"""Generate a stable Chrome extension ID (run once). Updates manifest.json and hoard_native_host.json."""

import base64
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXT_DIR = ROOT / "chrome-extension"
KEY_PEM = Path(__file__).resolve().parent / "key.pem"
MANIFEST = EXT_DIR / "manifest.json"
HOST_JSON = Path(__file__).resolve().parent / "hoard_native_host.json"


def extension_id_from_public_der(pub_der: bytes) -> str:
    digest = hashlib.sha256(pub_der).digest()
    return "".join(chr(97 + (digest[i] >> 4)) + chr(97 + (digest[i] & 0x0F)) for i in range(16))


def main():
    try:
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization
    except ImportError:
        import subprocess

        subprocess.check_call([sys.executable, "-m", "pip", "install", "cryptography", "-q"])
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization

    if KEY_PEM.exists():
        private_key = serialization.load_pem_private_key(KEY_PEM.read_bytes(), password=None)
        print(f"Using existing key: {KEY_PEM}")
    else:
        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        KEY_PEM.write_bytes(
            private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption(),
            )
        )
        print(f"Created new key: {KEY_PEM}")

    pub_der = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    key_b64 = base64.b64encode(pub_der).decode("ascii")
    ext_id = extension_id_from_public_der(pub_der)

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8-sig"))
    manifest["key"] = key_b64
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    host = json.loads(HOST_JSON.read_text(encoding="utf-8-sig"))
    host["allowed_origins"] = [f"chrome-extension://{ext_id}/"]
    HOST_JSON.write_text(json.dumps(host, indent=2) + "\n", encoding="utf-8")

    print(f"Extension ID: {ext_id}")
    print(f"Updated {MANIFEST.name} and {HOST_JSON.name}")
    print("Next: reload extension in chrome://extensions, then run install_native_host.ps1")


if __name__ == "__main__":
    main()
