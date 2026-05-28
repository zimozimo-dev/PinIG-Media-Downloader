# Chrome Web Store Listing Draft

## Recommended Visibility

Use **Unlisted** for team sharing. Anyone with the Chrome Web Store link can install it, but it is not discoverable by search.

Use **Private** only if your organization manages Chrome through Google Workspace / Chrome Enterprise and you want to restrict installation to your org.

## Basic Info

Name:
PinIG Media Downloader

Short description:
Download visible photos and videos from Instagram and Pinterest with single or batch controls.

Detailed description:
PinIG Media Downloader adds a clean floating control panel to Instagram and Pinterest pages so you can save visible media more efficiently.

Features:
- Download a single visible photo or video from the page.
- Batch download all currently loaded media.
- Filter batch downloads by all media, photos only, or videos only.
- Load more visible page media with assisted scrolling.
- Drag and resize the floating panel.
- Save files through the browser's standard Downloads flow.

Notes:
- This extension only works with media that is already visible or loaded by the current page.
- Private, restricted, expired, or temporary media URLs may not always be downloadable.
- Please respect platform terms, copyright, and creator permissions.

Category:
Productivity

Language:
English

## Privacy Practices

Single purpose:
Help users download visible photos and videos from Instagram and Pinterest pages.

Data collection:
This extension does not collect, sell, transmit, or share personal data.

Data usage:
Media URLs are detected locally in the browser and passed to the browser Downloads API only when the user clicks a download action.

Remote code:
No remote code is loaded.

## Permission Justification

downloads:
Required to save user-selected media through the browser's download manager.

storage:
Required to remember local UI preferences, such as floating panel position and size.

activeTab:
Used for current-tab interaction from the popup.

tabs:
Used by the popup to identify whether the current active tab is Instagram or Pinterest.

Host permissions:
- `*://*.instagram.com/*`
- `*://*.cdninstagram.com/*`
- `*://*.cdninstagram.net/*`
- `*://*.fbcdn.net/*`
- `*://*.pinterest.com/*`
- `*://*.pinimg.com/*`

Required to detect visible media on Instagram/Pinterest and download media from their CDN hosts after user action.

## Required Upload File

Upload this ZIP in the Chrome Web Store Developer Dashboard:

`../pinig-media-downloader-extension.zip`

Do not upload the source folder directly.

## Suggested Screenshots

Prepare 2-5 screenshots, ideally 1280 x 800 PNG/JPEG:

1. Floating panel on Instagram showing all/photos/videos counts.
2. Drag/resize panel demonstration.
3. Photos-only / videos-only dropdown.
4. Pinterest page support.
5. Browser downloads result.

