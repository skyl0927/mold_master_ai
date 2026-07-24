<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1Trb9ZzdGAzs7d3ykvvaMlNgei5bluHit

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Common Agent sync

This app can send captured field images and ROI annotations to Common Agent.

- Default Common Agent URL: `http://127.0.0.1:8000`
- Image diagnosis endpoint: `POST /v1/vision/diagnose`
- ROI annotation endpoint: `POST /v1/datasets/images/{image_id}/annotations`
- Auto-synced ROI review status: `candidate`

See [docs/common-agent-sync.md](./docs/common-agent-sync.md) for the field test workflow.
