# NEXORA STUDIO v1.8.0 — Cloud Infrastructure

Mobile-friendly AI production-company workspace designed for Android browser workflows. v1.8.0 builds on the earlier virtual office, 11-Agent roster, AI Brain, Gemini integrations, supervised production pipeline, media labs, Video Composer, and Production Control.



## What's new in v1.7.0 — Autonomous Production Control
- **Production Control:** a mobile-friendly control board to import the latest completed/partial 11-Agent pipeline run from local browser storage.
- **Department task board:** maps each Agent's output into a task with queued, working, review, approved, or revision status. Status changes are saved locally.
- **Scene production queue:** add scene descriptions and hand them to Kairo's AI Video Lab; send Aira, Viona, and Damar task outputs to their respective workspaces.
- **Production pack export:** export the project brief, Agent outputs, task statuses, and scene queue as JSON.
- **Approval gates:** production review remains human-supervised. No automatic publishing or unreviewed paid media generation is triggered.

### v1.7.0 workflow
1. Run or resume the 11-stage text pipeline in **Autonomous Studio**.
2. Open **Production Control** and tap **Import pipeline terbaru**.
3. Review each department output and update task status.
4. Add scene prompts to the scene queue. Use **Buka studio** on Aira, Kairo, Viona, or Damar to hand off the relevant text.
5. Generate media in the relevant workspace, inspect the output, then assemble approved assets in Video Composer.
6. Export the production pack JSON as a local backup.

**Important:** Production Control is a local orchestration and handoff layer, not a fully autonomous cloud workflow. It does not automatically invoke all image, video, and voice APIs, transfer generated media into a shared cloud asset store, or render a final cloud MP4. Agent pipeline results and task statuses are stored in this browser's localStorage; scene queue data is also local. Export backups before clearing site data or changing browsers/devices.

## What's new in v1.5.0 — AI Voice Production
- **Gemini TTS:** Viona can generate an actual narration audio file through a Netlify Function using `gemini-3.8-flash-lite-tts` or `gemini-3.8-flash-tts`.
- **Voice direction:** choose a supported preset voice, language, and a short delivery-style instruction.
- **WAV output:** generated audio can be previewed and downloaded. The function keeps `GEMINI_API_KEY` server-side.
- **Composer handoff:** send the generated WAV directly to the Video Composer audio input; it will be included when WebM rendering supports audio capture.
- **Device preview retained:** browser Speech Synthesis remains available as a quick local preview, but it is separate from the cloud AI output.

### Enable AI Voice
1. Deploy the `nexora-studio` folder to Netlify.
2. In Netlify Environment Variables, set `GEMINI_API_KEY` to the key used by the existing Gemini functions.
3. Trigger a fresh deploy after setting the variable.
4. Open **Voice Studio**, enter a narration of up to 3,500 characters, choose the model/voice/delivery direction, then tap **Generate AI Voice**.
5. Listen to the generated WAV, download it, or send it to Video Composer.

The default model is `gemini-3.8-flash-lite-tts`; `gemini-3.8-flash-tts` is available as a higher-fidelity option. Google controls model availability, quotas, data handling, and pricing. Review current pricing and provider terms before generating; usage may consume free quota or incur charges. The narration text is sent to Google for synthesis. Do not submit private or sensitive information.

## What's new in v1.2.0
- **AI Media Lab:** Aira can request an original image from the Gemini image model through a Netlify Function. The API key remains server-side.
- **Asset Library integration:** generated PNG images are stored in the same local IndexedDB library used by Creative Production.
- **Composer handoff:** send a saved generated image directly to Video Composer as a new scene.
- **Prompt controls:** visual style, aspect-ratio direction, and optional negative constraints.

## What's new in v1.0.0
- **Video Composer:** create scene cards, upload a still image per scene, add on-screen text, choose 9:16 / 16:9 / 1:1 output, set scene duration, and optionally select a narration/music audio file.
- **Local WebM rendering:** the browser records the canvas with `MediaRecorder` and offers the resulting `.webm` file for download. Audio is mixed when browser support permits.
- **Project draft:** scene text and project settings can be saved in localStorage; export a JSON project description. Image and audio file bytes are not embedded in the local draft, so reselect assets after reopening.
- **All v0.9.0 features retained:** 11-role supervised Gemini pipeline, stop/resume, output history, Agent knowledge context, 3D office, and earlier management areas.

## Deploy and configure from Android
1. Extract this ZIP on the phone.
2. Upload the `nexora-studio` folder to Netlify using its browser workflow, or deploy from a Git repository.
3. In Netlify Site configuration → Environment variables, add `GEMINI_API_KEY`.
4. Trigger a fresh deploy so the serverless function receives the key.
5. Open **AI Agent Lab** and tap **Uji koneksi server**.
6. Use **Autonomous Studio** for the supervised 11-stage text workflow.
7. Use **AI Media Lab** to generate a still image, then **Video Composer** to assemble images and text into a basic WebM video.

Official setup references:
- Google AI Studio API key: https://aistudio.google.com/app/apikey
- Gemini API docs: https://ai.google.dev/gemini-api/docs
- Gemini speech generation: https://ai.google.dev/gemini-api/docs/speech-generation
- Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing
- Netlify Functions: https://docs.netlify.com/build/functions/overview/

## AI Media Lab workflow
1. Open **AI Media Lab** and enter a detailed scene prompt.
2. Select a visual style and composition ratio.
3. Tap **Generate Image** and keep the tab open while the request runs.
4. The generated PNG is saved to the local Asset Library when browser storage is available.
5. Tap **Kirim ke Video Composer** to add the image as a new scene, then add captions and render.
6. Download the PNG separately if you want an independent copy.

Image generation uses the Gemini Interactions API and a server-side `GEMINI_API_KEY`. Model availability, quota, billing, region, and safety checks are controlled by Google. Do not assume free or unlimited image generation. Check current provider pricing before use.

## Video Composer workflow
1. Open **Video Composer**.
2. Set a project title, output ratio, and scene duration.
3. Tap **Tambah adegan**; upload an image and enter the scene caption. Repeat for each scene.
4. Optionally choose an audio file.
5. Preview, then tap **Render WebM**. Keep the browser tab open until rendering completes, then download the output.
6. Test with a short project first. Mobile browser support and memory limits vary by device.

## Important limitations
- The Composer assembles still images and text overlays into a simple video. AI Media Lab generates still images and Voice Studio generates narration WAV files; neither currently generates animated characters or complete AI video clips. The Composer is a lightweight browser renderer, not a professional nonlinear editor.
- Export is WebM; playback/editing compatibility varies by app. A separate conversion step may be needed for MP4 workflows.
- Audio mixing depends on browser MediaRecorder/Web Audio support. If unsupported, render may be silent.
- The Gemini text pipeline still produces text deliverables. Nara does not perform live web search; Kairo does not render animation; Viona synthesizes narration audio through the Gemini TTS function; Damar does not automatically edit/publish finished videos. Aira can generate still image files only through the new AI Media Lab.
- A complete pipeline may make up to 11 Gemini API calls and may consume quota or incur cost. Review provider limits and billing settings before use. Human review is required.
- The app is not an always-on background agent. Keep the page open during pipeline execution and video rendering.

## Security, privacy, and storage
- Keep `GEMINI_API_KEY` only in Netlify Environment Variables. Never put it in browser code or prompts.
- This prototype has no user authentication, per-user authorization, or robust rate limiting. A public deployment could allow others to invoke the serverless function and consume the configured API quota. Restrict access while testing and monitor usage.
- Agent memories, task history, and project settings are stored in browser `localStorage`; they are not cloud-synchronized and can be lost if browser site data is cleared. Export important work.
- Do not store passwords, API keys, or sensitive personal data in memories or project briefs.
- Only use media you own or are permitted to use.

## Compatibility
- Designed responsively for Android and desktop browsers. Use an up-to-date Chrome browser for best results.
- WebM rendering depends on `MediaRecorder` and canvas capture support. Large images, long videos, and limited phone memory can cause rendering failures.
- Three.js and fonts load from external CDNs, so internet access is required for the 3D office and remote fonts.

## Version history
- v0.5.0: employee identities, local employee management, CEO Memory, production planner.
- v0.6.0: local task queue, specialist routing, message log, simulated quota/rest controls.
- v0.7.0: per-Agent Knowledge Vault, context-pack builder, saved briefs.
- v0.8.0: server-side Gemini text connector and single-Agent Lab.
- v0.9.0: supervised sequential multi-Agent pipeline, progress persistence, stop/resume, Markdown export.
- **v1.0.0:** Video Composer with local still-image + text WebM assembly and project JSON export.
- **v1.1.0:** Character Bible, Creative Brief workspace, local Asset Library.
- **v1.2.0:** Gemini image generation, PNG Asset Library save, and handoff to Video Composer.
- **v1.3.0:** local device voice preview and camera-motion presets.
- **v1.4.0:** per-scene duration and transitions.
- **v1.5.0:** Gemini TTS WAV generation, voice controls, and Composer audio handoff.

## v1.1.0 — Creative Production Workspace
- Added Character Bible to preserve recurring fictional character descriptions and personality notes locally.
- Added Gemini-assisted creative brief generation for visual prompts, storyboard/animation direction, voice-over direction, and shot lists.
- Added a local IndexedDB Asset Library for image, audio, and video reference files.
- Creative outputs are text briefs; this release does not itself generate image, audio, or animation files. Uploaded assets remain on the current browser/device and are not sent to Gemini by this module.
- Existing Video Composer remains a separate local WebM assembly tool; asset-to-timeline linking is not automatic yet.
- Keep `GEMINI_API_KEY` in Netlify environment variables. Never place the key in frontend files.


## v1.3.0 — Voice & Motion Studio
- Added Viona Voice Studio with local browser Speech Synthesis preview, voice selection, rate/pitch controls, local script saving, and copy/send-to-composer actions. It does not export a generated audio file and is not cloud AI voice generation.
- Added per-scene camera motion presets in Video Composer: Ken Burns, zoom in/out, pan directions, and static. Motion is rendered into the WebM canvas recording.
- Voice script can be sent to the Composer as a scene caption. Upload a real audio file in Composer to include audio in the rendered WebM.
- Mobile-friendly layout; browser speech voices and MediaRecorder support vary by Android/browser.


## v1.4.0 — Animation Engine

Pembaruan Video Composer:
- Durasi dapat diatur per adegan (2–30 detik).
- Pilihan transisi per adegan: Fade, Fade melalui hitam, Wipe, dan Cut.
- Preview dan render menghitung durasi total dari durasi masing-masing adegan.
- Data proyek JSON menyimpan durasi dan transisi tiap adegan.
- Tetap mendukung gerakan kamera 2D dari v1.3.0.

Batasan: ini adalah animasi gambar 2D berbasis Canvas, bukan generasi image-to-video, bukan animasi karakter, dan bukan editor profesional. File gambar/audio tetap perlu dipilih ulang setelah draft lokal dimuat.


## v1.5.0 — AI Voice Production
- Added a Netlify serverless function for Gemini 3.8 TTS. API keys remain server-side.
- Added model, preset voice, language, and delivery-style controls, WAV preview/download, and direct WAV handoff to Video Composer.
- Retained device Speech Synthesis for local preview.
- TTS is limited to 3,500 characters per request; split longer scripts into sections. Check audio output manually because synthesis may omit or mispronounce words.


# NEXORA STUDIO v1.6.0 — AI Video Lab

## What's new
- Added **AI Video Lab** for cloud text-to-video and image-to-video generation using Gemini Omni 1.2 Flash on Google Cloud Vertex AI Interactions API.
- Added optional first-frame image upload (PNG/JPEG/WebP, max 8 MB) to a private Google Cloud Storage bucket using a short-lived V4 signed upload URL.
- Added background interaction polling, MP4 preview, and a 15-minute signed download link.
- Added a server-side access-code gate (`NEXORA_VIDEO_ACCESS_CODE`) to reduce casual public abuse of the video-generation endpoints.
- Existing Voice Studio, AI Media Lab, Video Composer, and previous workspaces remain included.

## AI Video Lab setup (requires an adult account owner/admin)
This integration is **not configured by `GEMINI_API_KEY` alone**. It uses Google Cloud Vertex AI and a Cloud Storage bucket. Video generation can incur charges. Because this setup involves cloud credentials and possible billing, ask a parent/guardian or an authorized adult to create and review the Google Cloud project, billing controls, service account, and bucket. Do not create or enable paid resources without their help.

1. In Google Cloud, select/create a project and enable **Vertex AI API** and **Cloud Storage**.
2. Create a Cloud Storage bucket in a supported location. Keep it private; do not enable public access. Set the bucket name in Netlify as `VEO_BUCKET`.
3. Create a service account for the backend. Grant only the required permissions, scoped to the bucket where possible:
   - Vertex AI User (`roles/aiplatform.user`) on the project.
   - Storage Object Creator (`roles/storage.objectCreator`) on the video bucket.
   - Storage Object Viewer (`roles/storage.objectViewer`) on the video bucket.
4. Create a service-account JSON key only if the organization/account owner permits it. Store the complete JSON document in Netlify Environment Variables as `GOOGLE_SERVICE_ACCOUNT_JSON`. Never put it in `index.html`, JavaScript, GitHub, chat, or a public file.
5. Set `GOOGLE_CLOUD_PROJECT` to the project ID (the function can also read `project_id` from the JSON key).
6. Set `VEO_BUCKET` to the bucket name only (not `gs://`).
7. Set `NEXORA_VIDEO_ACCESS_CODE` to a strong private access code. Enter that code in the AI Video Lab UI when using it. Do not reuse an account password.
8. Configure bucket CORS to allow the exact deployed Netlify site origin for signed browser PUT uploads. Example `storage-cors.json` (replace the origin with the exact site URL):

```json
[
  {
    "origin": ["https://YOUR-SITE.netlify.app"],
    "method": ["PUT", "GET", "HEAD"],
    "responseHeader": ["Content-Type", "ETag"],
    "maxAgeSeconds": 3600
  }
]
```

Apply the CORS configuration to the bucket using the Google Cloud Console/Cloud Shell workflow supported by your account administrator. Do not make the bucket public just to bypass CORS.
9. Deploy the complete `nexora-studio` folder to Netlify and trigger a fresh deploy after all environment variables are set.
10. Open **AI Video Lab**, enter the access code, write a prompt, optionally select a reference image, and tap **Generate AI Video**. The page checks the cloud job periodically. Keep the site open while monitoring; the interaction ID is saved locally so you can check again after reopening the page.

### Video generation behavior
- Model: `gemini-omni-1.2-flash` on Vertex AI Interactions API.
- Output: MP4, 720p, one clip per request.
- Aspect ratio: 9:16 or 16:9.
- Duration options: 5, 8, 10, 12, or 15 seconds.
- Optional first-frame reference image: PNG, JPEG, or WebP, max 8 MB.
- Output files are stored under `nexora-output/`; reference uploads are stored under `nexora-input/`.
- The signed MP4 link expires after 15 minutes. If it expires, press **Periksa status** again while the job is still available to request a fresh link.
- Image upload uses a short-lived signed URL (15 minutes). The browser requires the bucket CORS origin to match the exact Netlify deployment URL.

## Important limitations and security
- The AI Video Lab creates **one short generated clip per request**. It does not yet create a complete multi-scene episode, guarantee recurring-character identity across separate generations, perform dedicated lip-sync, or automatically assemble all clips into a final movie.
- The generated video is not automatically imported into Video Composer. Download the MP4 and use a separate compatible editor/workflow if you need to assemble multiple generated clips.
- Google model access, region availability, safety checks, quotas, and pricing are controlled by Google Cloud and may change. Review current provider terms and pricing before use. Never assume video generation is free or unlimited.
- The access code is a lightweight gate, not a complete user authentication system. Do not publish the site widely. Restrict the Netlify deployment and monitor cloud usage. A stronger authenticated backend is planned for a later release.
- Service-account JSON keys are highly sensitive. Keep them only in server-side Netlify environment variables; rotate/revoke them if exposed.
- Generated clips and source images are stored in the configured Cloud Storage bucket. Set a lifecycle/retention policy with the account administrator and remove files that are no longer needed.
- The site does not expose the service-account key to browser JavaScript. The frontend sends only the access code and task data to Netlify Functions.

Official references:
- Google Cloud video generation: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-text
- Google Cloud image-to-video: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-an-image
- Google Cloud service account authentication: https://cloud.google.com/docs/authentication
- Cloud Storage signed URLs: https://cloud.google.com/storage/docs/access-control/signed-urls
- Cloud Storage CORS: https://cloud.google.com/storage/docs/cross-origin
- Netlify Functions: https://docs.netlify.com/build/functions/overview/

## Version history update
- **v1.6.0:** AI Video Lab using Gemini Omni 1.2 Flash on Vertex AI; text-to-video, optional first-frame image-to-video, cloud job polling, MP4 preview, signed download, and access-code gate.

## What's new in v1.8.0 — Cloud Infrastructure
- **Supabase Cloud Center:** optional cloud storage for Agent memories, task records, activity logs, and small uploaded assets.
- **Server-side credentials:** Supabase service-role key is read only by `netlify/functions/cloud-data.mjs`; it is never sent to the browser.
- **Shared access gate:** Cloud Center uses `NEXORA_CLOUD_ACCESS_CODE`, stored in `sessionStorage` only for the current browser tab session. This is a simple shared-code gate, not individual user authentication.
- **Cloud Agent Memory:** save and browse notes by Agent across devices using the same deployed site and access code.
- **Cloud Task Queue:** create tasks and update their statuses in Supabase.
- **Private Asset Storage:** upload/download/delete files from a private `nexora-assets` bucket. Per-file limit is 4 MB in this prototype.
- **Activity Logs & JSON backup:** record manual events and download the current cloud records as a JSON backup.
- **Database schema:** `supabase-schema.sql` creates the required tables, indexes, RLS settings, and private storage bucket.

### v1.8.0 setup (phone-friendly browser workflow)
1. Create a Supabase project. Open its SQL Editor and run the complete contents of `supabase-schema.sql` once.
2. In Supabase project settings, copy the Project URL and the `service_role` secret key. Keep the service-role key private.
3. In Netlify, open the deployed site's Environment Variables and add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a strong unique `NEXORA_CLOUD_ACCESS_CODE`.
4. Trigger a new deploy so the Netlify Function receives the variables.
5. Open NEXORA > Cloud Center, enter the cloud access code, and tap **Hubungkan cloud**.
6. Test by saving one Agent memory, adding one task, and uploading a small non-sensitive file. Try downloading it and exporting a JSON backup.

**Security notes:** Never put `SUPABASE_SERVICE_ROLE_KEY` in `index.html`, `cloud.js`, public environment variables, screenshots, or messages. The service-role key bypasses Supabase Row Level Security, so only the server function may use it. The shared access code is a prototype gate and can be shared or leaked; rotate it if exposed. Use a long random code distinct from the video access code. Do not upload personal, confidential, or copyrighted files without permission. Keep database backups and understand provider limits/costs before enabling paid plans.

**Known limitations:** the Cloud Center is optional and is not yet a full identity/authentication system. Existing localStorage/IndexedDB workspaces are not automatically migrated or bidirectionally synchronized. Production Control, Autonomous Studio run state, Video Composer projects, and AI outputs remain local unless separately exported. The JSON backup is an export only; automatic restore and scheduled backups are not included. Large media files are not supported by the 4 MB upload endpoint. Supabase setup, Netlify deployment, and credentials are required before cloud features work.
