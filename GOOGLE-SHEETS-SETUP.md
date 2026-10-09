# BITEWINK — Google Sheets response capture setup

This build preserves the existing page structure, visible copy, styles and responsive layout. It adds centralized capture for anonymous validation selections and Founding 100 registrations. The endpoint is intentionally left unconfigured until you deploy the Apps Script below.

## Data captured

- `SurveyResponses`: one row per browser session, updated as a visitor selects a meal need, frequency, budget, or “I'd try this” concept. It stores a session ID, selected values, page URL, user-agent string and timestamps. It does not store the visitor's name or phone.
- `Founding100`: one row per submitted registration, including name, phone, area/PIN, chosen meal, frequency, budget, selected concepts, session ID and submission time.

The site uses a simple cross-origin POST to the Apps Script endpoint. Browsers do not expose the response body for `no-cors` requests, so a visible “sent” status means the browser dispatched the request, not that a server-side write has been independently confirmed. Confirm test rows in Sheets before publishing.

## Deploy

1. Create a new Google Sheet in the Google account that should own the responses. You do not need to create tabs manually; the script creates `SurveyResponses` and `Founding100` on first submission.
2. In that spreadsheet, choose **Extensions → Apps Script**.
3. Replace the editor contents with `google-apps-script/Code.gs` from this package. Save the project.
4. In Apps Script, choose **Deploy → New deployment**.
5. Select the type **Web app**.
6. Set **Execute as** to **Me**. Set access to **Anyone** so public visitors can submit the form. This means the endpoint is publicly callable; the script validates fields, but it is not a full anti-abuse service. If your account does not offer public access, use an approved alternative endpoint.
7. Click **Deploy**, complete Google's authorization prompts, and copy the Web app URL ending in `/exec`.
8. Open `script.js` and replace `PASTE_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE` in `BITEWINK_SHEETS_ENDPOINT` with that URL. Keep the URL in quotes.
9. Commit/push the updated `script.js` to the same GitHub Pages branch/folder that serves the site.
10. Open the deployed Apps Script URL in a browser. It should show a small JSON response indicating the service is ready.

## Test before sharing the site

1. Open the live website in a private/incognito window.
2. Select a meal under “What would make a better everyday meal for you?”.
3. Click one or more “I'd try this” buttons, then choose a frequency and budget.
4. Open the Google Sheet and confirm a row appears/updates in `SurveyResponses` with that session ID.
5. Submit a test Founding 100 registration using a test phone number. Confirm a row appears in `Founding100`.
6. Submit the same survey session with more choices and confirm the existing survey row updates instead of adding a new row.
7. Delete test personal data after validation.

## Updating the deployment

After changing `Code.gs`, save and use **Deploy → Manage deployments → Edit** to publish a new version of the existing web app deployment. If you create a new deployment, update the endpoint URL in `script.js` too.

## Privacy and operational notes

- Limit spreadsheet access to people who need it; phone numbers and locality are personal data.
- Publish an appropriate privacy notice before collecting real visitor information. Explain the purpose, retention and contact channel. Collect contact details only for the stated purpose.
- The current visible form copy has been preserved. Its “Founding 100” action and early-update language are the context for registration. Consider adding an explicit consent control and privacy-notice link before a larger campaign; that would be a visible copy/layout change and is not included in this preservation-focused build.
- The anonymous survey endpoint can be called by anyone who knows the URL. For a wider campaign, add stronger rate limiting / CAPTCHA or route submissions through a server-side endpoint with abuse controls.
- The website cannot confirm a successful write with the current cross-origin `no-cors` browser request. Verify in Sheets during testing. For stronger delivery guarantees, use a server-side endpoint that returns a verifiable response and supports CORS.
