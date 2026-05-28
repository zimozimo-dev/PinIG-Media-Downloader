# Release Checklist

## Free Team Distribution

For 10-20 teammates without Chrome Web Store publishing, use Git repository distribution:

1. Push this folder as a Git repository.
2. Share `TEAM_INSTALL_GUIDE.md` with teammates.
3. Teammates clone the repository or download the ZIP.
4. Teammates open `chrome://extensions/`.
5. Teammates enable Developer mode.
6. Teammates click Load unpacked and select this folder.
7. For updates, teammates run `git pull` or download the latest ZIP, then click the extension reload button.

## Chrome Web Store Distribution

For 10-20 teammates, the best path is Chrome Web Store **Unlisted** publishing:

1. Create or use a Chrome Web Store developer account.
2. Open the Chrome Web Store Developer Dashboard.
3. Create a new item.
4. Upload `pinig-media-downloader-extension.zip`.
5. Fill in store listing fields from `STORE_LISTING.md`.
6. Fill in privacy fields from `STORE_LISTING.md` and link to a hosted copy of `PRIVACY_POLICY.md`.
7. Set visibility to **Unlisted**.
8. Submit for review.
9. Share the approved install link with teammates.

## Before Upload

- Confirm `manifest.json` version has increased.
- Confirm `pinig-media-downloader-extension.zip` was rebuilt after edits.
- Test install via `chrome://extensions` > Developer mode > Load unpacked.
- Test on Instagram.
- Test on Pinterest.
- Test all filters: all, photos only, videos only.
- Test drag and resize panel.
- Test browser download output.

## Updating Later

1. Edit source files.
2. Increase `manifest.json` version.
3. Rebuild the ZIP.
4. Upload the new ZIP to the same Chrome Web Store item.
5. Submit for review.

Chrome Web Store installs update automatically after the new version is approved and rolled out.
