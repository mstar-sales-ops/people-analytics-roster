# Roster Stitch

Client-side React app for Sales Operations to merge a live roster with an SFDC change log and export a stitched roster CSV.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## GitHub Pages deployment

This repo includes a GitHub Actions workflow at `.github/workflows/deploy.yml` that deploys the built `dist/` folder to GitHub Pages whenever code is pushed to `main`.

Repo-specific setup:

1. In GitHub, open `Settings` > `Pages`.
2. Under `Build and deployment`, set `Source` to `GitHub Actions`.
3. Push the repository contents to the `main` branch.
4. After the workflow completes, the site will publish at:

`https://mstar-sales-ops.github.io/people-analytics-roster/`

## Notes

- All CSV parsing and transformation runs in the browser.
- Uploaded files are not sent to a backend service.
- The current prototype accepts a few common header aliases for both CSV inputs.
