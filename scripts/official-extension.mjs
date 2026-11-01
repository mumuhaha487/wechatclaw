import fs from "node:fs/promises";
import path from "node:path";
import { createHash, verify } from "node:crypto";

export const officialExtensionId = "hehggadaopoacecdllhhajmbjkdcmajg";
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const extensionId = key => sha256(key).slice(0, 32).replace(/[0-9a-f]/g, char => String.fromCharCode(97 + parseInt(char, 16)));

function fields(buffer) {
  const values = []; let offset = 0;
  const integer = () => {
    let value = 0, scale = 1;
    for (let count = 0; count < 8; count++) {
      if (offset >= buffer.length) throw new Error("Truncated CRX protobuf");
      const byte = buffer[offset++]; value += (byte & 127) * scale;
      if (!(byte & 128)) return value;
      scale *= 128;
    }
    throw new Error("Invalid CRX protobuf integer");
  };
  while (offset < buffer.length) {
    const tag = integer(), number = tag >>> 3, wire = tag & 7;
    if (wire === 2) {
      const size = integer(); if (offset + size > buffer.length) throw new Error("Truncated CRX protobuf field");
      values.push({ number, bytes: buffer.subarray(offset, offset + size) }); offset += size;
    } else if (wire === 0) integer();
    else throw new Error("Unsupported CRX protobuf field");
  }
  return values;
}

export function verifyOfficialCrx(bytes) {
  if (bytes.length < 12 || bytes.subarray(0, 4).toString() !== "Cr24" || bytes.readUInt32LE(4) !== 3) throw new Error("Expected an official CRX3 archive");
  const length = bytes.readUInt32LE(8); if (12 + length >= bytes.length) throw new Error("Truncated CRX archive");
  const header = fields(bytes.subarray(12, 12 + length)), zip = bytes.subarray(12 + length);
  const signed = header.find(field => field.number === 10000)?.bytes;
  if (!signed) throw new Error("Missing CRX signed header");
  const signedId = fields(signed).find(field => field.number === 1)?.bytes;
  const size = Buffer.alloc(4); size.writeUInt32LE(signed.length);
  const payload = Buffer.concat([Buffer.from("CRX3 SignedData\0"), size, signed, zip]);
  let publicKey;
  const proofs = header.filter(field => [2, 3].includes(field.number)).map(field => {
    const proof = fields(field.bytes), key = proof.find(value => value.number === 1)?.bytes, signature = proof.find(value => value.number === 2)?.bytes;
    if (!key || !signature) throw new Error("Incomplete CRX signature");
    const id = extensionId(key), valid = verify("sha256", payload, { key, format: "der", type: "spki" }, signature);
    if (id === officialExtensionId && valid) publicKey = key;
    return { id, verified: valid };
  });
  if (!publicKey || !signedId?.equals(createHash("sha256").update(publicKey).digest().subarray(0, 16))) throw new Error("Official ChatGPT extension signature or ID does not match");
  return { zip, publicKey: publicKey.toString("base64"), proof: { id: officialExtensionId, signatureVerified: true, crxSha256: sha256(bytes), zipSha256: sha256(zip), proofs } };
}

export async function collectOfficialExtension(output, extract) {
  await fs.mkdir(output, { recursive: true });
  const url = new URL("https://clients2.google.com/service/update2/crx");
  url.searchParams.set("response", "redirect"); url.searchParams.set("prodversion", "154.0.8037.98");
  url.searchParams.set("acceptformat", "crx3"); url.searchParams.set("x", "id=" + officialExtensionId + "&uc");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Official extension download HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer()), verified = verifyOfficialCrx(bytes);
  const archive = path.join(output, "extension.zip"), directory = path.join(output, "extension");
  await fs.writeFile(archive, verified.zip); await fs.mkdir(directory, { recursive: true }); await extract(archive, directory);
  const manifestFile = path.join(directory, "manifest.json"), manifest = JSON.parse(await fs.readFile(manifestFile, "utf8"));
  if (manifest.manifest_version !== 3 || !manifest.permissions?.includes("nativeMessaging")) throw new Error("Official extension manifest lacks the expected native messaging API");
  if (manifest.key && extensionId(Buffer.from(manifest.key, "base64")) !== officialExtensionId) throw new Error("Extension manifest key differs from its signed identity");
  const manifestKeyAdded = !manifest.key;
  if (manifestKeyAdded) { manifest.key = verified.publicKey; await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2)); }
  const proof = { ...verified.proof, version: manifest.version, manifestKeyAdded, source: response.url };
  await fs.writeFile(path.join(output, "extension-proof.json"), JSON.stringify(proof, null, 2));
  return { directory, proof };
}
