// Generates the ECDSA P-256 key pair that signs app licenses.
//   node supabase/scripts/license-keys.mjs
// Private key → Supabase secret APP_LICENSE_PRIVATE_JWK (never commit it).
// Public key  → LICENSE_PUBLIC_JWK in gsender-ui/src/account/config.ts.
// Rotating the pair signs everyone out of Pro offline until their app checks in again.
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const strip = ({ kty, crv, x, y, d }) => (d ? { kty, crv, x, y, d } : { kty, crv, x, y });
console.log("APP_LICENSE_PRIVATE_JWK (Supabase secret):");
console.log(JSON.stringify(strip(await crypto.subtle.exportKey("jwk", privateKey))));
console.log("\nLICENSE_PUBLIC_JWK (app):");
console.log(JSON.stringify(strip(await crypto.subtle.exportKey("jwk", publicKey))));
