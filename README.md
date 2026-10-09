# BITEWINK validation MVP

This package includes the asset-optimized static website plus Google Sheets response capture integration.

## Before deployment

1. Follow `GOOGLE-SHEETS-SETUP.md` to create and deploy the Google Apps Script endpoint.
2. Put the deployed `/exec` URL in `BITEWINK_SHEETS_ENDPOINT` at the top of `script.js`.
3. Deploy the complete package to GitHub Pages.
4. Run the survey and Founding 100 test steps in the setup guide and verify rows in the spreadsheet.

The website does not activate food ordering or payment.
