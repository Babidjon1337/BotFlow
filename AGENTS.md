# IMAGE GENERATION WORKFLOW

When working on frontend/design tasks, do not use random stock images or arbitrary placeholder images when a custom visual asset is genuinely needed.

If a custom image is required, stop and ask the user to generate it.

Use this exact format:

## IMAGE REQUEST

**Name:**
[asset name]

**Where it will be used:**
[screen + exact location]

**Purpose:**
[what UX/business/visual purpose it serves]

**Size:**
[recommended dimensions]

**Aspect ratio:**
[16:9, 4:3, 1:1, etc.]

**Main subject:**
[what should be shown]

**Composition:**
[position of subject, negative space, framing, perspective]

**Style:**
[photorealistic / editorial / premium SaaS / etc.]

**Lighting:**
[detailed lighting direction]

**Color direction:**
[colors and overall mood]

**Background:**
[detailed background description]

**Details:**
[important visual details]

**Negative prompt:**
[things that must not appear]

**READY-TO-USE IMAGE PROMPT:**
[full prompt that can be sent directly to an image generation model]

Then STOP and wait for the user to provide the generated image.

After receiving the image:

1. Analyze whether it matches the request.
2. Point out any important mismatch.
3. If acceptable, integrate it into the frontend.
4. Verify the final result visually.

Do not request an image merely for decoration.

Only request custom imagery when it materially improves:

- product storytelling;
- UX clarity;
- visual hierarchy;
- branding;
- trust;
- conversion;
- the overall visual concept.

Prefer HTML/CSS/UI solutions when an image is not actually necessary.
