// scripts/xero-auth.js
const { XeroClient } = require("xero-node");
const readline = require("readline");

async function main() {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  const redirectUri = process.env.XERO_REDIRECT_URI;
  const scopes = (process.env.XERO_SCOPES || "").split(" ");

  if (!clientId || !clientSecret || !redirectUri || !scopes.length) {
    console.error(
      "Missing one of XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REDIRECT_URI, XERO_SCOPES in env."
    );
    process.exit(1);
  }

  const xero = new XeroClient({
    clientId,
    clientSecret,
    redirectUris: [redirectUri],
    scopes,
  });

  const consentUrl = await xero.buildConsentUrl();
  console.log("\n1) Open this URL in your browser:\n");
  console.log(consentUrl);
  console.log(
    "\n2) Log in to Xero and approve FuelFlow when asked.\n" +
      "3) After approval, Xero will redirect you to your redirect URL " +
      "(it may show an error – that's fine). Copy the FULL URL from your browser's address bar.\n"
  );

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question(
    "4) Paste the full redirect URL here and press Enter:\n",
    async (redirectUrl) => {
      try {
        await xero.apiCallback(redirectUrl.trim());
        const tokenSet = xero.readTokenSet();

        console.log("\n✅ NEW XERO_TOKEN_SET value (copy everything below):\n");
        console.log(JSON.stringify(tokenSet, null, 2));
        console.log(
          "\nPaste this JSON into Vercel as the value of XERO_TOKEN_SET and redeploy."
        );
      } catch (err) {
        console.error("\n❌ Error exchanging code for tokens:\n", err);
      } finally {
        rl.close();
      }
    }
  );
}

main().catch((err) => {
  console.error(err);
});
