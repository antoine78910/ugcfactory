"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Smartphone, Package2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCreditsPlan, getPersonalApiKey, getPersonalPiapiApiKey } from "@/app/_components/CreditsPlanContext";
import { uploadFileToCdn } from "@/lib/uploadBlobUrlToCdn";
import { STUDIO_IMAGE_FILE_ACCEPT } from "@/lib/studioUploadValidation";
import { cn } from "@/lib/utils";
import { linkToAdVideoCredits, type LinkToAdSeedanceSpeed } from "@/lib/pricing";

type AdsStudioHistoryItem = {
  id: string;
  createdAt: number;
  assetType: "product" | "app";
  prompt: string;
  imageUrl?: string;
  videoUrl?: string;
};

const LS_ADS_STUDIO_HISTORY = "ugc_ads_studio_history_v1";

type TemplateVideoItem = { filename: string; label: string; url: string };

const TEMPLATE_PROMPT_HYPER_MOTION = `chocolate japanese style commercial, with chocolate crunching, pieces breaking, hands passing chocolate to each other, japanese happy people smiling while biting, and these little characters animated`;

const TEMPLATE_PROMPT_UNBOXING = `VIDEO — 10-second vertical (9:16) satisfying ASMR unboxing of "FROGGY PRINCE" by "MELON STUDIO × PLAY PALS"
Product: A cute vinyl art toy figure — a chubby character wearing a green frog costume hoodie with a small red felt crown on top. Big black sparkly eyes with white star highlights, rosy pink cheeks, open happy smile. Orange bow tie, red heart on the belly, white boots with red heart details. Comes in a square pastel-yellow box with green lid, plus collectible art cards.
Format: Overhead top-down camera looking straight down at a light wooden desk surface. Only hands visible — female hands, short natural nails, cozy oversized sage-green sweater sleeves. Warm soft natural lighting from a window on the left. Slow, deliberate, ASMR-style movements.
Scene 1 — Box Tap + Open (0–3s): The sealed yellow-and-green square box sits centered on the wooden desk. The illustrated Froggy Prince character is visible on the front — a cute kid in a frog hoodie with "Froggy Prince" in playful green cursive and "MELON STUDIO × PLAY PALS" below. Fingers tap the box lid three times — satisfying hollow cardboard thuds. Then both hands grip the green lid and lift it straight up slowly — revealing white tissue paper inside with a small round green sticker seal. The lid is placed to the right.
Scene 2 — Tissue Peel + Figure Reveal (3–6s): Fingers peel the green sticker seal (satisfying crisp peel sound), then pull the tissue paper apart to reveal the Froggy Prince figure nestled in a shaped foam insert. A brief pause — the figure sits snugly in its cutout, the red felt crown, glossy green body, and pink cheeks immediately visible. One hand lifts the figure out gently, holds it up at center frame, and rotates it slowly — showing the front face (big star eyes, open smile), the orange bow tie, the red heart on the belly, and the little white boots. The vinyl surface catches the warm light with a soft glossy sheen.
Scene 3 — Cards + Final Display (6–10s): The figure is placed standing upright on the desk. Hands reach back into the box and pull out two square art cards stacked together. The first card (orange background, sparkle details) is slid to the left — showing the illustrated Froggy Prince character with "FROGGY PRINCE" in bold blue retro text. The second card (pink background, heart frame) is slid to the right — showing the character inside a rainbow heart. Both cards are tapped once into alignment on the desk. Final arrangement: the figure standing center on the wooden desk, the open box behind it, the green lid leaning against the box showing the illustrated front, both art cards fanned in front. Hands pull away. Hold the beauty shot for 1.5 seconds — warm light, cozy desk, the little frog prince smiling at camera.
Overall style: Cozy ASMR unboxing for Xiaohongshu/TikTok. Top-down overhead, no face, only hands. Every sound is crisp and amplified: cardboard tap, sticker peel, tissue rustle, vinyl figure lifted from foam, cards sliding on wood. No music — pure ASMR sounds only. Warm natural daylight, light wooden surface, sage-green sweater sleeves for color harmony with the frog character. Slow, satisfying, tactile. Vertical 9:16. Designer toy collector aesthetic.`;

const TEMPLATE_PROMPT_UGC = `Vertical 9:16 selfie-style UGC tennis racket review, shot on iPhone front and back camera mix, natural daylight on an outdoor tennis court, handheld authentic energy, casual "showing a friend my new racket" vibe, warm natural light, real skin tones, no filters
An outdoor tennis court — green or blue hard court surface with white lines, a net visible in the background, natural daylight, open sky above. The young woman wears a bright lime green tennis outfit — a fitted lime green sleeveless tennis dress or matching lime green tennis top and skirt, the vivid green a striking contrast against the mint green and orange of the AURA 300 racket; she holds the SERA AURA 300 tennis racket — mint green to white gradient frame, orange cross-string pattern through the white string face, white perforated grip tape, AURA 300 lettering on the shaft, a mint green butt cap at the handle end.
Action and dialogue sequence:
She holds the AURA 300 up to the front camera with one hand, the full racket face filling the vertical frame, her bright lime green sleeve visible at the edge of the frame, the mint green frame and the orange string pattern sharp in the daylight: she tilts it slowly catching the sun across the surface, speaking naturally: "Okay so this just arrived and I am obsessed with the color." She flips it to show the back face, then tilts to show the mint-to-white gradient on the shaft where AURA 300 is printed, the lime green of her outfit creating a vivid color contrast beside the racket.
She switches to the back camera. Holds the racket out at arm's length, the lime green dress visible in the frame, and bounces the racket lightly on her palm: "It feels really balanced, like not too heavy." She brings the racket close to the back lens so the orange cross-string pattern fills the frame — the individual string intersections sharp, the orange against white vivid in the open daylight.
She props the phone against her bag or the court fence pointing toward her. She bounces a ball and hits two slow controlled groundstrokes toward the net — the bright lime green outfit and the mint AURA 300 frame moving through the frame together on each swing, the two greens catching the daylight differently, the racket head tracking cleanly through the air. She picks the phone back up.
Close-up back camera shot — she holds the racket face close to the lens, the orange string mesh filling the vertical frame, then slowly pans down the shaft past the AURA 300 lettering to the white grip tape, her lime green sleeve visible at the top of the frame, her fingers wrapping the grip naturally: "And the grip feels so good, really clean." She holds the full racket up one final time beside her face on the front camera — bright lime green outfit, mint green racket, orange strings — smiles directly into the lens: "Yeah. Yeah this is the one."`;

const TEMPLATE_PROMPT_UGC_2 = `Vertical 9:16 selfie-style UGC phone case review, shot on iPhone front and back camera mix, warm natural indoor light, soft cozy energy, casual "showing a friend my new case" vibe, real skin tones, no filters, intimate low-key mood
A bright casual room — warm natural light from the side, a clean surface or bed behind her, soft and cozy atmosphere. The young woman holds the clear glitter liquid phone case — a transparent hard shell case with a rainbow iridescent border trim, filled with liquid glitter and confetti stars in pastel and holographic colors, and a collection of tiny 3D charms resting at the bottom: two yellow smiley face emojis, a white unicorn, a blue car, a pink car, a purple car, a yellow rubber duck, a green cactus, a blue dinosaur — all floating and shifting when the case moves.
Action and dialogue sequence:
She holds the case up to the front camera with both hands, the clear front facing the lens, the rainbow border catching the warm room light: she says nothing for a beat — just slowly tilts the case left, and all the tiny charms and glitter drift together to the side in the liquid. She tilts it right, they drift back. She looks at the camera with wide eyes: "Wait. Wait look at this."
She tilts the case again slowly, the camera close on the front face, the charms tumbling through the glitter liquid in slow motion — the smiley faces, the unicorn, the rubber duck all visible shifting through the holographic confetti stars. She brings it even closer to the front lens so the charms fill the frame: "There is a dinosaur in here. And a duck. WHY is there a duck."
She switches to the back camera, holds the case flat and then tips it vertically — the charms and glitter cascade downward through the liquid in a slow satisfying drift, the rainbow border glowing in the warm light, the holographic stars catching every shift of light. She tilts it back the other way, the whole contents drifting again: "I cannot stop doing this."
She props the phone and holds the case up with both hands, shaking it gently — the glitter and charms swirl in all directions, the liquid catching the light in shifting rainbow patches, the tiny 3D charms tumbling through. She looks at the camera, shakes it once more slowly: "This is genuinely the most satisfying thing I own right now." She holds it still beside her face on the front camera, the rainbow border glowing, smiles directly into the lens: "That's it. That's the review."`;

const TEMPLATE_PROMPT_UGC_TRY_ON = `Style: UGC, get ready with me, iPhone front camera, fashion vlog, playful energy

A stylish young girl is filming herself in her room while getting dressed. The room is aesthetic — mirror, clothes, soft natural daylight, slight creative mess.

Shot on iPhone front camera, vertical 9:16, natural HDR, slight handheld movement, real skin tones, no color grading.

Outfit is laid out or partially worn: white top with red stars, camo skirt, bold red furry boots.

She walks into frame adjusting her top, looks into camera: “Okay, I’m getting ready and I don’t know if this outfit is crazy or—”

Suddenly, someone (guy/friend) walks into frame casually from the side. She immediately reacts, pushes him out of frame: “Hey— no, get out!” She laughs.

She turns back to camera like nothing happened: “Anyway… I kinda love it.”

She steps back slightly to show full outfit.

“It’s a little chaotic…”
“But it works.”

She poses slightly: “I’m wearing this.”

Natural messy UGC vibe, playful interruption moment, confident energy, full body outfit visible, light humor.`;

const TEMPLATE_PROMPT_UGC_3 = `Vertical 9:16 UGC sneaker unboxing and review, shot on iPhone front and back camera mix, bright natural daylight from a window, casual bedroom energy, handheld selfie perspective, real skin tones, no filters, fun and expressive creator vibe
A bright casual bedroom or living room — natural daylight from the side, a clean floor space visible, the pair of FUNNY STEPS sneakers sitting on the floor or a surface in front of her — multicolor upper panels in blue mesh, orange, green, yellow and purple leather panels, white laces with multicolored eyelets, a FUNNY STEPS logo tab on the tongue and side, and a clear transparent air bubble sole filled with tiny 3D charms and confetti pieces — miniature teddy bears, stars, colorful shapes all visible floating inside the sole.
Action and dialogue sequence:
She picks up one sneaker with both hands and holds it directly to the front camera lens, the clear sole facing the lens so all the tiny charms inside are visible through the transparent bubble: she tilts it slowly and the charms shift and tumble inside the sole. Her eyes go wide directly at camera: "There are TOYS in the sole. Actual tiny toys." She tilts it the other way, the charms drifting again, the colored confetti pieces catching the daylight inside the bubble.
She switches to the back camera, holds the sneaker sole-up close to the lens — the clear bubble sole fills the vertical frame, all the tiny teddy bears and stars and colorful shapes sharp through the transparent material, pressing against the inside of the sole as she tips it: "A little bear. There is a little bear in there." She taps the sole gently with one finger and the charms bounce inside.
She sets the phone down propped against something, sits on the floor and pulls both sneakers on — lacing them quickly, the multicolor panels and white laces visible on her feet. She stands up, picks the phone up and points the back camera down at her feet: both FUNNY STEPS sneakers on the floor, the clear charm-filled soles visible from above, the rainbow of blue orange green yellow purple panels bright in the daylight. She stomps one foot lightly and the charms bounce inside the sole.
She brings the front camera back up to face level, holds one sneaker up beside her face — the multicolor upper and the clear charm sole both visible — looks directly into the lens, completely genuine: "I am twenty years old and these are my favorite shoes I have ever owned." She holds the sneaker up one final time so the clear sole faces the camera, tilts it once more slowly, the tiny toys drifting inside: "You are welcome."`;

const TEMPLATE_PROMPT_UGC_4 = `Shot on iPhone front camera, vertical 9:16, natural HDR, slight exposure shifts, real skin tones, authentic UGC creator energy, warm indoor natural light
A bright casual room — warm natural light from the side, a clean desk surface with the ATELIER INK 12 CORE colors set in its clear transparent plastic case, the colorful marker caps visible through the case walls, a white sketchpad open beside it. A young woman sits close to the front camera, relaxed and natural, speaking slowly and genuinely.
Action and dialogue sequence:
She picks up the full ATELIER INK clear case with both hands and holds it up to the front camera, the 12 colorful caps facing the lens, the label readable. She looks at it for a beat — then at the camera: "Okay I need to show you these." She sets the case down, pulls out the green G04 marker, uncaps it slowly, sniffs the tip, pauses. Looks at camera: "Why does it smell like that." Genuine. Unhurried.
She opens the sketchpad and draws a slow deliberate star with the green marker. Holds the paper up to the lens. Says nothing for a beat — just lets the color speak. Then quietly: "That color is insane." She picks up the cobalt blue B17, draws beside the green. Holds it up again. "The pigment is so good."
She sets the paper down. Looks directly into the camera. Taps the marker cap slowly against her lip. One breath. Then: "Honestly — if you draw, if you doodle — just get these." She lifts the full clear case up to the lens, all 12 caps facing camera. Holds it there. Smiles slowly. Says nothing. Then: "That's it. That's the review."`;

const TEMPLATE_PROMPT_UNBOXING_2 = `Style: UGC, gym vlog, iPhone front camera, real effort, natural energy

A young girl is filming herself in a modern aesthetic gym, people training in the background.

Shot on iPhone front camera, vertical 9:16, slight shake, real gym lighting, no grading.

She is pedaling on a pastel stationary bike, already slightly tired.

She is breathing heavily and speaking directly while working out.

“Okay… I thought this was gonna be easy…”
(breathing heavily)
“It’s not.”
She laughs.
“But it’s actually so good.”`;

const TEMPLATE_PROMPT_UGC_TRY_ON_2 = `dynamic`;

const TEMPLATE_PROMPT_TUTORIAL = `A 15-second vertical UGC product review video, iPhone aesthetic. The girl is reviewing and demonstrating the blender — not teaching a recipe. She's excited about the product itself.
⚡ 0–2s — HOOK: Girl holds the dark charcoal green blender base close to camera with both hands, eyes wide, says straight into lens: "This blender just changed my morning routine."
2–5s: She runs her finger along the matte dark body, taps the single round green dial knob, then spins it slowly — small copper LED dots light up around it. She tilts her head impressed: "One knob. That's literally all you need."
5–8s: She lifts the clear glass jar, knocks on it with her knuckle — solid sound — and shows the blade assembly underneath: "Glass jar, not plastic. You can actually see everything inside."
8–11s: She locks the jar onto the base with a satisfying click, loads fruits in, presses the dial — blender fires up instantly. She steps back and gestures at it like "look at this thing": "Hear how quiet that is?"
11–13s: She pours the smoothie, holds the glass up to the light — vibrant color, smooth texture: "First try. No chunks."
13–15s: Takes a sip, looks at the blender, then back to camera with a nod: "Yeah. Worth it."
Style: Raw UGC product review, vertical 9:16, warm natural light, clean kitchen counter, blender always in frame, handheld shaky cam, no text overlays.`;

const TEMPLATE_PROMPT_UGC_5 = `HOOK (0–2 sec) POV handheld shot, slightly shaky. A bright red shopping bag with gold text "MAISON BRUNÉ" gets tossed onto a white unmade bed from above — lands with a satisfying thud, tissue paper rustling. Natural bedroom lighting, warm tones. Authentic, raw, no tripod.
JUMP CUT 1 (2–4 sec) Close-up hands grabbing the red bag handles, pulling it closer. Camera slightly out of focus then snaps sharp. Nail polish, casual outfit visible at edges. Breathing audible.
JUMP CUT 2 (4–7 sec) Hands pull out the pink dustbag — "MAISON BRUNÉ PARIS" printed in rose. Fabric sliding sound. Slow squeeze of the dustbag, then quick reveal yank.
JUMP CUT 3 (7–12 sec) Tan pebbled leather tote bag drops onto the bed in full frame. Gold chain strap clinks and settles. Camera circles product quickly — chaotic but intentional. Natural window light catches the gold hardware.
JUMP CUT 4 (12–18 sec) Extreme close-up: fingers running across the grainy leather texture. Gold lobster clasp swings. Chain strap draped over hand — slow pan up arm.
OUTRO (18–22 sec) Bag held up toward camera with both hands — full reveal. Slight smile reflected in mirror behind. Red shopping bag and pink dustbag visible on bed in background.`;

const TEMPLATE_PROMPT_UNBOXING_3 = `A 15-second vertical (9:16) ASMR-style jewelry unboxing video. Top-down overhead camera angle throughout. The surface is draped in soft white silk or satin fabric with gentle folds and creases creating elegant light and shadow. Soft diffused natural daylight, warm tone. No text overlays, no logos, no branding. Silent visual ASMR — slow, theatrical, satisfying.
0–3s: A striking matte red square gift box sits centered on the white silk. The box has a theatrical design — on the lid, a silver heart-shaped clasp with a keyhole in the center, surrounded by four small decorative square patches with graphic black-and-white optical patterns (stripes, sunbursts). A white satin ribbon trails loosely from under the box across the silk. Her hands (natural nails, no polish, one thin gold ring) enter frame from the bottom and gently touch the sides of the box, fingers tracing the heart clasp. She slowly turns the heart clasp — it clicks open with a satisfying motion.
3–7s: She opens the box — but it doesn't open like a normal lid. The box unfolds outward like a book or a theater stage, the front panel swinging open on a hinge to reveal an elaborate inner scene. Inside is a miniature diorama: a deep navy blue backdrop painted with gold shooting stars and pink paper-cut clouds at the bottom — like a tiny magical night sky theater. In the center of this scene, suspended on a small hook, hangs a single delicate silver chain necklace with a small silver key pendant. The key has a heart-shaped bow at the top. The diorama catches the light — gold foil stars shimmer, the pendant slowly sways. Her hands pause, letting the viewer take in the reveal.
7–10s: She carefully unclips the necklace from its display hook inside the diorama. She lifts it out slowly — the thin silver chain catches the light as it rises from the blue backdrop. She drapes the necklace across her open palm over the white silk, the key pendant dangling between her fingers. She turns her hand slightly so the pendant rotates and catches the light from different angles — the silver gleams against her skin.
10–13s: She lays the necklace down on the white silk in a gentle S-curve. She picks up the open box and tilts it toward camera — showing off the inner diorama scene one more time: the navy sky, gold stars, pink clouds, the tiny text at the bottom reading "you are the key." The box's theatrical pop-up construction is visible — layered paper-cut elements creating depth.
13–15s: Final flatlay — the open red box sits at the top of frame, its diorama interior visible like a tiny stage. The silver key necklace lies on the white silk below in an elegant curve. The white ribbon trails diagonally across the frame. Her hand gently adjusts the pendant one last time, then slowly pulls away. The silk catches a gentle highlight. Hold. End.
Style: Aesthetic jewelry unboxing / visual ASMR. Overhead POV, only hands visible. The star of the video is the packaging — a theatrical, interactive box that opens like a storybook to reveal a miniature paper-cut diorama scene, making the unboxing feel like unlocking a tiny magical world. One single jewelry piece inside — the reveal is slow and dramatic. Color palette: matte red box, navy blue interior, gold foil accents, pink paper clouds, silver jewelry, pure white silk background. The contrast between the white silk and red box is bold and eye-catching. Intimate, luxurious, deeply satisfying, gift-worthy. No brand names visible anywhere.`;

const TEMPLATE_PROMPT_UGC_TRY_ON_3 = `A 15-second vertical (9:16) UGC try-on video filmed on a smartphone. A young East Asian woman with a short black bob haircut stands in front of a full-length mirror in a minimalist bedroom — neutral beige walls, natural daylight from a window. Handheld selfie-style camera, authentic influencer energy, slightly warm tones.
0–3s: She faces the mirror camera wearing a simple white bathrobe or basic white tee and shorts. She holds up the outfit pieces on hangers — a black fitted top and a black-and-white striped mini skirt — showing them to camera with a "watch this" expression, raises an eyebrow playfully.
3–5s: Quick jump cut — she's now wearing the fitted black short-sleeve top with a mock neckline, slightly structured and tailored at the waist. She adjusts the hem, smoothing it down, turns side to side checking the fit in the mirror. The top has a clean minimal look — matte black fabric, cap sleeves, a subtle peplum-like shape at the waist.
5–8s: Another jump cut — she pulls on the black-and-white horizontal striped knit mini skirt, tugging it over her hips. The skirt is very short, body-con, sitting low on the waist just below the top's hem. She adjusts the waistband and does a quick spin to show the fit from all angles.
8–11s: Jump cut — now the full outfit is complete. She's added bright neon yellow opaque tights covering her legs entirely, and matching neon yellow pointed-toe stiletto pumps. She puts on a pair of retro oval sunglasses with yellow-amber tinted lenses. She steps back from the mirror to show the full look head to toe — black top, striped mini, yellow tights, yellow heels, yellow shades. She does a confident slow turn, hand on hip.
11–15s: She faces the mirror straight on, strikes a final pose — legs slightly apart, arms at her sides, chin slightly up, deadpan editorial expression through the yellow sunglasses. She holds the pose for a beat, then breaks into a small satisfied smile. She reaches toward the phone and the video cuts.
Style: Authentic UGC / TikTok try-on haul aesthetic. Quick jump cuts between each stage of getting dressed. Handheld slight camera shake. Natural bedroom lighting, no ring light. The outfit is the star — the contrast between the monochrome black-and-white top half and the bold neon yellow bottom half creates a striking graphic pop-art look. The vibe is effortlessly cool, editorial-meets-street, confident. No music specified. No text, no logos, no filters.`;

const TEMPLATE_PROMPT_UGC_TRY_ON_STREET = `A trendy 13-second vertical (3:4) street style fashion video filmed on a European cobblestone street with grey stone building facades. Shot on a smartphone in a raw, authentic influencer/TikTok style with fast dynamic cuts, varied camera angles, and natural daylight. The model is a stylish young Asian woman with dark hair pulled into a sleek bun, wearing retro cat-eye glasses, pearl drop earrings, and red nail polish.
Outfit: A burgundy-wine leather blazer with structured shoulders over a black corset top layered on a white collared shirt with a thin black tie. A short black bubble skirt (puffball mini). Sheer wine-red tinted tights. Black pointed-toe ankle-strap heels. A compact elongated burgundy leather bowling bag with silver chain detail and star-shaped charms hanging across the front.
Scene 1 — Accessory Tease (0–1.5s): Opens with a first-person POV shot from behind the camera — someone's hand extends into frame from the left, holding the burgundy bowling bag by its straps toward the model who stands a few meters away on the sidewalk in front of a stone building entrance with a dark glass door. The model reacts with an excited, surprised expression — mouth open, hands gesturing "give it to me." Camera is slightly low angle, handheld, casual. The bag is sharp in the foreground, the model slightly soft in the background.
Scene 2 — Detail Flatlay (1.5–3.5s): Cut to a top-down POV shot looking down at the ground. The model is sitting on the cobblestones — we see her legs in sheer wine tights and black pointed heels from above. The burgundy bag sits on the ground to the left. She holds a phone in her hand between her feet, scrolling through a photo of herself in the same outfit (a mirror-selfie style shot visible on the phone screen). Her other hand with burgundy nails rests near the phone. The composition is a casual "what's in my feed" moment. Camera is steady, overhead angle.
Scene 3 — Bag Pickup (3.5–5s): Close-up side angle shot at ground level. The model crouches down to pick up the bag from the cobblestones — we see her burgundy leather sleeve with white shirt cuff peeking out, her hand gripping the bag handles, the silver chain detail catching light. Her legs in tights and heels are visible in the background. Intimate detail shot emphasizing the bag texture and craftsmanship.
Scene 4 — Low Angle Power Shot (5–6.5s): Ultra-low angle shot from the ground looking up at the model. She towers over the camera confidently, the burgundy blazer and black corset framing the shot. The sky, building facade, and tree branches are visible behind her. Strong backlighting creates a slight lens flare. She has a confident, editorial expression, looking slightly down at camera.
Scene 5 — Walking Detail (6.5–7.5s): Side-angle close-up at knee height. The model bends down or walks, picking up / adjusting the bag. Focus on the leather blazer sleeve, bag handles, her hands, and the silver chain swinging. The stone wall provides a neutral textured backdrop. Natural motion blur.
Scene 6 — Portrait with Bag (7.5–9s): Medium close-up selfie-style angle. The model faces the camera, slightly turned, showing off the bag hanging from her arm. She holds the bag strap with one hand near her face, showing off her red nails and pearl earrings. Confident, slightly playful expression. The glass entrance door and stone columns are behind her. Natural daylight, warm tones.
Scene 7 — Walking Shot Profile (9–10.5s): Side profile tracking shot. The model walks past the stone building wall, bag on her shoulder. Her full outfit is visible — the burgundy blazer, black corset, bubble skirt, wine tights, pointed heels. The bag hangs perfectly at her side with the chain catching light. A green potted plant is visible near the entrance. She walks with purpose, slightly looking down. Cinematic, editorial feel.
Scene 8 — Full Body Pose (10.5–12s): Full body frontal shot. The model stands between stone columns, facing the camera directly. She raises both hands near her chin in a cute, playful gesture. The entire outfit is visible head to toe — glasses, blazer, corset, skirt, tights, heels, bag on shoulder. She shifts her weight slightly, posing naturally.
Scene 9 — Final Walk Away (12–13s): Three-quarter back/side tracking shot. The model walks away along the building, looking over her shoulder toward camera with a knowing glance. The bag is tucked under her arm. Sunlight catches the leather blazer. She moves with effortless cool energy. The video ends mid-stride.
Overall style: Raw, authentic street style content shot on smartphone. Fast cuts (1–2 seconds each). Mix of POV, close-up detail, low angle, and full body shots. Natural handheld camera movement with slight shake. Warm European daylight. Color palette dominated by burgundy/wine, black, and cool grey stone. Monochromatic outfit coordination — bag, blazer, tights, and nails all matching in wine tones. No text overlays, no filters. Upbeat background music (not generated). Fashion influencer energy — confident, playful, editorial yet casual.`;

const TEMPLATE_PROMPT_UGC_6 = `A young stylish female influencer  s in a cozy modern apartment with soft natural daylight. She records herself using the front camera of her phone (selfie mode), holding the phone in one hand and the AURA  Tumbler 40oz in the other. The camera has slight natural hand movement, casual framing, and feels real and unpolished.
She looks directly into the camera, relaxed and natural, like talking to a friend. While speaking, she casually rotates the tumbler, shows the handle and lid, lightly taps it, and takes a small sip.
Dialogue (natural, calm, ~15 sec):
"I’ve been using this tumbler every day lately, and I didn’t expect to like it this much.
My drinks stay cold literally all day, which is kind of crazy.
It doesn’t leak, it fits in my car, and the handle is actually super comfortable.
I just end up taking it with me everywhere now."`;

const TEMPLATE_PROMPT_UNBOXING_4 = `Man influencer  first opens the box  then takes the product with its packaging out of the box

Dialogue (quiet, impressed, natural):
"Okay… wow.
This is actually beautiful.
It feels… really refined.
Like, nothing extra — just clean, perfect details."

NO MUSIC, ONLY SFX`;

const TEMPLATE_PROMPT_UGC_TRY_ON_6 = `Style: UGC luxury, iPhone front camera, natural high-end lifestyle
Prompt:
A young stylish woman  is inside a modern luxury mansion (large windows, soft sunlight, neutral tones, minimal expensive interior).
Shot on iPhone front camera, vertical 9:16, Apple HDR, slightly overexposed highlights, realistic skin texture, natural lens distortion, no cinematic grading.
She is wearing a gold cuff bracelet .

Action:
She brings her wrist closer to camera:
"Okay… I didn’t expect to like this this much."
She rotates her wrist — light reflects naturally.

Dialogue:
"It’s super simple, but it looks really expensive."
She adjusts it.
"And it goes with literally everything."

She looks into camera:
"I’ve been wearing it every day."

Details (IMPORTANT):
natural iPhone highlight roll-off
slight exposure flicker when hand moves
realistic reflections on gold
subtle handheld micro shake
no perfect studio lighting`;

function normalizeTemplateLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function promptForTemplateLabel(label: string): string {
  const n = normalizeTemplateLabel(label);
  if (n.includes("tutorial")) return TEMPLATE_PROMPT_TUTORIAL;
  if (n.includes("unboxing 4") || n.includes("unboxing4")) return TEMPLATE_PROMPT_UNBOXING_4;
  if (n.includes("unboxing 3") || n.includes("unboxing3")) return TEMPLATE_PROMPT_UNBOXING_3;
  if (n.includes("unboxing 2") || n.includes("unboxing2") || n.includes("unoboxing 2") || n.includes("unoboxing2")) {
    return TEMPLATE_PROMPT_UNBOXING_2;
  }
  if (
    n.includes("try on 6") ||
    n.includes("try-on 6") ||
    n.includes("tryon 6") ||
    n.includes("tryon6") ||
    n.includes("tr on 6") ||
    n.includes("tron 6")
  ) {
    return TEMPLATE_PROMPT_UGC_TRY_ON_6;
  }
  if (n.includes("try on 3") || n.includes("try-on 3") || n.includes("tryon 3") || n.includes("tryon3")) {
    return TEMPLATE_PROMPT_UGC_TRY_ON_3;
  }
  if (n.includes("try on 2") || n.includes("try-on 2") || n.includes("tryon 2") || n.includes("tryon2")) {
    return TEMPLATE_PROMPT_UGC_TRY_ON_2;
  }
  if (n.includes("ugc 6") || n.includes("ugc6")) return TEMPLATE_PROMPT_UGC_6;
  if (n.includes("ugc 5") || n.includes("ugc5")) return TEMPLATE_PROMPT_UGC_5;
  if (n.includes("try on")) return TEMPLATE_PROMPT_UGC_TRY_ON_STREET;
  if ((n.includes("ugc") && (n.includes(" 4") || n.endsWith("4") || n.includes("(4)"))) || n.includes("ugc4")) {
    return TEMPLATE_PROMPT_UGC_4;
  }
  if ((n.includes("ugc") && (n.includes(" 3") || n.endsWith("3") || n.includes("(3)"))) || n.includes("ugc3")) {
    return TEMPLATE_PROMPT_UGC_3;
  }
  if (n.includes("hyper") && n.includes("motion")) return TEMPLATE_PROMPT_HYPER_MOTION;
  if (n.includes("unoboxing") || n.includes("unboxing")) return TEMPLATE_PROMPT_UNBOXING;
  if (
    (n.includes("ugc") && (n.includes("(2)") || n.includes(" 2") || n.endsWith("2"))) ||
    n.includes("ugc 2")
  ) {
    return TEMPLATE_PROMPT_UGC_2;
  }
  if (n.includes("ugc")) return TEMPLATE_PROMPT_UGC;
  return `${label} style, short high-converting vertical ad.`;
}

async function pollNanoTask(taskId: string, personalApiKey?: string): Promise<string[]> {
  const max = 90;
  const keyParam = personalApiKey ? `&personalApiKey=${encodeURIComponent(personalApiKey)}` : "";
  for (let i = 0; i < max; i++) {
    const res = await fetch(`/api/nanobanana/task?taskId=${encodeURIComponent(taskId)}${keyParam}`, { cache: "no-store" });
    const json = (await res.json()) as {
      data?: { successFlag?: number; response?: Record<string, unknown>; errorMessage?: string };
      error?: string;
    };
    if (!res.ok || !json.data) throw new Error(json.error || "Image poll failed");
    const s = json.data.successFlag ?? 0;
    if (s === 0) {
      await new Promise((r) => setTimeout(r, 1800));
      continue;
    }
    if (s === 1) {
      const resp = json.data.response ?? {};
      const candidates: unknown[] = [
        (resp as { resultImageUrl?: unknown }).resultImageUrl,
        (resp as { resultUrls?: unknown }).resultUrls,
        (resp as { resultUrl?: unknown }).resultUrl,
        (resp as { result_image_url?: unknown }).result_image_url,
      ];
      const urls = candidates.flatMap((v) => {
        if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
        if (typeof v === "string") return [v];
        return [];
      });
      if (!urls.length) throw new Error("No image URL in result.");
      return urls;
    }
    throw new Error(json.data.errorMessage || "Image generation failed.");
  }
  throw new Error("Timeout waiting for image.");
}

async function pollVideo(taskId: string, personalApiKey?: string, piapiApiKey?: string): Promise<string> {
  const max = 120;
  const keyParam = `${personalApiKey ? `&personalApiKey=${encodeURIComponent(personalApiKey)}` : ""}${piapiApiKey ? `&piapiApiKey=${encodeURIComponent(piapiApiKey)}` : ""}`;
  for (let i = 0; i < max; i++) {
    const res = await fetch(`/api/kling/status?taskId=${encodeURIComponent(taskId)}${keyParam}`, { cache: "no-store" });
    const json = (await res.json()) as {
      data?: { status?: string; response?: string[]; error_message?: string | null };
      error?: string;
    };
    if (!res.ok || !json.data) throw new Error(json.error || "Video poll failed");
    const st = json.data.status ?? "IN_PROGRESS";
    if (st === "IN_PROGRESS") {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    if (st === "SUCCESS") {
      const u = json.data.response?.[0];
      if (!u || typeof u !== "string") throw new Error("Video ready but no output URL.");
      return u;
    }
    throw new Error(json.data.error_message || "Video generation failed.");
  }
  throw new Error("Timeout waiting for video.");
}

export default function AdsStudioPanel() {
  const { planId, isTrial } = useCreditsPlan();
  const [assetType, setAssetType] = useState<"product" | "app">("product");
  const [seedanceSpeed, setSeedanceSpeed] = useState<LinkToAdSeedanceSpeed>("normal");
  const [videoDurationSec, setVideoDurationSec] = useState<5 | 10 | 15>(10);
  const [prompt, setPrompt] = useState("");
  const [appRefUrl, setAppRefUrl] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<AdsStudioHistoryItem[]>([]);
  const [templateVideos, setTemplateVideos] = useState<TemplateVideoItem[]>([]);
  const appInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_ADS_STUDIO_HISTORY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as AdsStudioHistoryItem[];
      if (!Array.isArray(parsed)) return;
      setHistory(parsed.filter((x) => x && typeof x.id === "string").slice(0, 24));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_ADS_STUDIO_HISTORY, JSON.stringify(history.slice(0, 24)));
    } catch {
      /* ignore */
    }
  }, [history]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/studio/template-videos?t=${Date.now()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { videos?: TemplateVideoItem[] } | null;
      if (cancelled) return;
      const videos = Array.isArray(json?.videos) ? json.videos : [];
      setTemplateVideos(videos);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canGenerate = useMemo(() => prompt.trim().length > 0 && !isGenerating, [prompt, isGenerating]);
  const generationCredits = useMemo(
    () => linkToAdVideoCredits("seedance", videoDurationSec, seedanceSpeed),
    [videoDurationSec, seedanceSpeed],
  );
  const presetPreviewVideos = useMemo(
    () => history.map((h) => h.videoUrl).filter((u): u is string => typeof u === "string" && u.length > 0),
    [history],
  );

  async function uploadRef(file: File, kind: "app" | "avatar") {
    try {
      const url = await uploadFileToCdn(file, { kind: "image" });
      if (kind === "app") setAppRefUrl(url);
      else setAvatarUrl(url);
      toast.success(kind === "app" ? "App reference uploaded" : "Avatar uploaded");
    } catch (err) {
      toast.error("Upload failed", { description: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  async function runGenerate(promptOverride?: string) {
    const p = (promptOverride ?? prompt).trim();
    if (!p) return;
    const personalApiKey = getPersonalApiKey();
    const piapiApiKey = getPersonalPiapiApiKey();
    setIsGenerating(true);
    setImageUrl(null);
    setVideoUrl(null);
    try {
      const enrichedPrompt =
        assetType === "app"
          ? `${p}\n\nCreate an APP-focused ad visual (UI usage, mobile screen context, feature/value outcomes).`
          : `${p}\n\nCreate a PRODUCT-focused ad visual (packaging, product handling, realistic creator environment).`;
      const imageRes = await fetch("/api/nanobanana/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountPlan: planId,
          model: "pro",
          prompt: enrichedPrompt,
          imageUrls: appRefUrl.trim() ? [appRefUrl.trim()] : undefined,
          resolution: "2K",
          aspectRatio: "9:16",
          personalApiKey: personalApiKey ?? undefined,
        }),
      });
      const imageJson = (await imageRes.json()) as { taskId?: string; error?: string };
      if (!imageRes.ok || !imageJson.taskId) throw new Error(imageJson.error || "Image generation failed");
      toast.message("Image generation started");
      const imageUrls = await pollNanoTask(imageJson.taskId, personalApiKey ?? undefined);
      const firstImage = imageUrls[0] ?? "";
      if (!firstImage) throw new Error("No generated image URL.");
      setImageUrl(firstImage);

      const videoPrompt = `${enrichedPrompt}\n\nMake this a high-converting short vertical ad clip.`;
      const videoRes = await fetch("/api/kling/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountPlan: planId,
          marketModel:
            seedanceSpeed === "vip"
              ? "bytedance/seedance-2-preview-vip"
              : "bytedance/seedance-2-preview",
          prompt: videoPrompt,
          imageUrl: firstImage,
          duration: videoDurationSec,
          aspectRatio: "9:16",
          sound: true,
          personalApiKey: personalApiKey ?? undefined,
          piapiApiKey: piapiApiKey ?? undefined,
        }),
      });
      const videoJson = (await videoRes.json()) as { taskId?: string; error?: string };
      if (!videoRes.ok || !videoJson.taskId) throw new Error(videoJson.error || "Video generation failed");
      toast.message("Video generation started");
      const vUrl = await pollVideo(videoJson.taskId, personalApiKey ?? undefined, piapiApiKey ?? undefined);
      setVideoUrl(vUrl);
      const item: AdsStudioHistoryItem = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        assetType,
        prompt: p,
        imageUrl: firstImage,
        videoUrl: vUrl,
      };
      setHistory((prev) => [item, ...prev].slice(0, 24));
      toast.success("Ads Studio generation complete");
    } catch (err) {
      toast.error("Ads Studio", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setIsGenerating(false);
    }
  }

  function recreateFromTemplate(label: string) {
    const nextPrompt = promptForTemplateLabel(label);
    // Always replace current prompt (never append), even when input already contains text.
    setPrompt(nextPrompt);
    void runGenerate(nextPrompt);
  }

  return (
    <div className="space-y-10">
      <section className="flex min-h-[64vh] items-center justify-center">
        <div className="relative place-self-center w-full max-w-[980px] overflow-hidden rounded-[20px]">
          <div className="relative rounded-[20px] bg-[linear-gradient(0deg,rgba(21,21,21,0.88)_0%,rgba(21,21,21,0.88)_100%),linear-gradient(41deg,rgba(101,189,235,0.24)_25.53%,rgba(101,189,235,0.00)_63.06%)] p-4 shadow-[0_12px_8px_0_rgba(0,0,0,0.20),inset_0_0_0_1px_rgba(255,255,255,0.07)] backdrop-blur-[20px]">
          <div className="absolute -left-20 bottom-0 hidden origin-bottom-right transition-all duration-300 sm:block">
            <div className="h-[120px] min-h-[120px] w-[70px] rounded-[20px] bg-[rgba(0,0,0,0.05)] p-1 shadow-[0_12px_8px_0_rgba(0,0,0,0.20),inset_0_0_0_1px_rgba(255,255,255,0.08)] backdrop-blur-[20px]">
              <div className="flex h-full min-h-0 flex-col justify-center gap-1">
                <button
                  type="button"
                  onClick={() => setAssetType("product")}
                  className={cn(
                    "relative z-0 flex min-h-0 w-full flex-1 basis-0 flex-col items-center justify-center gap-1 rounded-[16px] px-3 py-1.5 text-[10px] font-semibold leading-[14px] transition-colors",
                    assetType === "product" ? "bg-white/[0.06] text-white" : "text-white/50 hover:text-white/70",
                  )}
                >
                  <Package2 className="size-4 shrink-0" />
                  <span>Product</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAssetType("app")}
                  className={cn(
                    "relative z-0 flex min-h-0 w-full flex-1 basis-0 flex-col items-center justify-center gap-1 rounded-[16px] px-3 py-1.5 text-[10px] font-semibold leading-[14px] transition-colors",
                    assetType === "app" ? "bg-white/[0.06] text-white" : "text-white/50 hover:text-white/70",
                  )}
                >
                  <Smartphone className="size-4 shrink-0" />
                  <span>App</span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid w-full grid-cols-[1fr_auto] items-center gap-3 rounded-[20px]">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1 items-start gap-3 overflow-hidden">
                <button
                  type="button"
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-white/85 shadow-[0_2px_1.5px_-0.5px_rgba(0,0,0,0.1)]"
                >
                  <Plus className="size-4" />
                </button>
                <div className="min-w-0 flex-1 pb-2">
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe what happens in the ad..."
                    className="h-[72px] max-h-[112px] resize-none overflow-y-auto border-0 bg-transparent p-0 text-sm text-white caret-violet-300 placeholder:text-white/35 focus-visible:ring-0"
                  />
                </div>
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="flex h-8 items-center gap-1.5 rounded-lg bg-white/[0.04] px-2.5 text-xs font-semibold text-white">
                  <span>UGC</span>
                </span>
                <span className="flex h-8 items-center gap-1 rounded-lg bg-white/[0.04] px-2 text-xs font-semibold text-white/90">
                  Mobile
                </span>
                <span className="flex h-8 items-center gap-1 rounded-lg bg-white/[0.04] px-2 text-xs font-semibold text-white/90">
                  3:4
                </span>
                <div className="inline-flex h-8 items-center rounded-lg bg-white/[0.04] px-1">
                  {([5, 10, 15] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setVideoDurationSec(d)}
                      className={cn(
                        "rounded px-1.5 py-1 text-xs font-semibold transition",
                        videoDurationSec === d ? "bg-white text-black" : "text-white/85 hover:text-white",
                      )}
                    >
                      {d}s
                    </button>
                  ))}
                </div>
                <div className="inline-flex h-8 items-center rounded-lg bg-white/[0.04] px-1">
                  {(["normal", "vip"] as const).map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setSeedanceSpeed(tier)}
                      className={cn(
                        "rounded px-1.5 py-1 text-xs font-semibold transition",
                        seedanceSpeed === tier ? "bg-white text-black" : "text-white/85 hover:text-white",
                      )}
                    >
                      {tier === "vip" ? "VIP" : "Normal"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-1.5">
              <button
                type="button"
                onClick={() => appInputRef.current?.click()}
                className="group relative flex h-20 w-[80px] flex-col items-start justify-between overflow-hidden rounded-xl bg-white/[0.05] p-1.5 shadow-[10px_34px_24px_0_rgba(0,0,0,0.15),1px_3px_4px_0_rgba(0,0,0,0.32),0px_1px_2px_0_rgba(0,0,0,0.32)]"
              >
                <span className="inline-flex size-5 items-center justify-center rounded-full border border-white/30 bg-white/[0.06]">
                  <Plus className="size-3 text-white" />
                </span>
                <p className="text-[12px] font-bold uppercase text-white">App</p>
              </button>
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="group relative flex h-20 w-[80px] flex-col items-start justify-between overflow-hidden rounded-xl p-1.5 shadow-[10px_34px_24px_0_rgba(0,0,0,0.15),1px_3px_4px_0_rgba(0,0,0,0.32),0px_1px_2px_0_rgba(0,0,0,0.32)]"
              >
                {avatarUrl ? (
                  <>
                    <img src={avatarUrl} alt="Avatar" className="absolute inset-0 h-full w-full rounded-xl object-cover" />
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-transparent to-[#202020]" />
                  </>
                ) : (
                  <div className="absolute inset-0 rounded-xl bg-white/[0.05]" />
                )}
                <p className="relative z-10 text-[12px] font-bold uppercase text-white">Avatar</p>
              </button>
              <Button
                type="button"
                onClick={() => void runGenerate()}
                disabled={!canGenerate}
                className="group relative flex h-[88px] w-[152px] items-center justify-center overflow-hidden rounded-xl border border-white/10 px-6 py-[30px] font-grotesk text-xs font-bold uppercase text-white shadow-[10px_34px_24px_0_rgba(0,0,0,0.15),8px_21px_6px_0_rgba(0,0,0,0.01),0px_13px_16px_0_rgba(254,23,73,0.13),3px_7px_5px_0_rgba(0,0,0,0.25),1px_3px_4px_0_rgba(0,0,0,0.43),0px_1px_2px_0_rgba(0,0,0,0.49)] transition-[transform,filter,opacity] duration-200 enabled:hover:brightness-110 enabled:active:scale-[0.99] disabled:opacity-60"
              >
                <div className="absolute inset-0 rounded-xl bg-[#ff4f9a]" />
                <div className="absolute inset-0 rounded-xl bg-[linear-gradient(180deg,rgba(255,255,255,0.2)_0%,rgba(0,0,0,0)_100%)] mix-blend-overlay" />
                <div className="absolute inset-0 rounded-xl bg-[linear-gradient(180deg,rgba(255,255,255,0.32)_0%,rgba(0,0,0,0)_100%)] mix-blend-hard-light" />
                <div className="absolute inset-0 rounded-xl bg-[radial-gradient(79%_44%_at_44%_124%,rgba(255,28,138,1)_0%,rgba(255,28,138,0)_100%)]" />
                <div className="relative flex flex-col items-center gap-0.5 text-white [text-shadow:0px_0px_8px_rgba(255,255,255,0.45)]">
                  <div className="flex items-center gap-1.5">
                    <span>{isGenerating ? "GENERATING" : "GENERATE"}</span>
                    {isTrial ? <span className="opacity-80">+ {generationCredits}</span> : null}
                  </div>
                </div>
              </Button>
            </div>
          </div>
          <input
            ref={appInputRef}
            type="file"
            accept={STUDIO_IMAGE_FILE_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadRef(f, "app");
              e.currentTarget.value = "";
            }}
          />
          <input
            ref={avatarInputRef}
            type="file"
            accept={STUDIO_IMAGE_FILE_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadRef(f, "avatar");
              e.currentTarget.value = "";
            }}
          />
        </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1140px]">
        <p className="mb-2 text-sm font-semibold text-white/85">Generate across formats</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
          {templateVideos.map((tpl, idx) => {
            const label = tpl.label || `Template ${idx + 1}`;
            const templateUrl = tpl.url;
            const previewUrl = templateUrl ?? presetPreviewVideos[idx] ?? null;
            return (
              <div
                key={tpl.filename || templateUrl}
                className="group relative aspect-[9/16] overflow-hidden rounded-2xl border border-white/10 bg-black/35"
                onMouseEnter={(e) => {
                  const video = e.currentTarget.querySelector("video");
                  if (video) void video.play().catch(() => undefined);
                }}
                onMouseLeave={(e) => {
                  const video = e.currentTarget.querySelector("video");
                  if (video) {
                    video.pause();
                    video.currentTime = 0;
                  }
                }}
              >
                {previewUrl ? (
                  <video
                    src={previewUrl}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-violet-900/35 via-[#15141f] to-[#0a0a11] text-[11px] font-semibold text-white/35">
                    Missing preview
                  </div>
                )}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/60" />
                <p className="pointer-events-none absolute left-3 top-2 text-[11px] font-semibold text-white/90">{label}</p>
                <button
                  type="button"
                  onClick={() => recreateFromTemplate(label)}
                  disabled={isGenerating}
                  className="absolute bottom-3 left-1/2 z-20 h-9 -translate-x-1/2 rounded-full border border-white/25 bg-white/90 px-5 text-sm font-semibold text-black opacity-0 transition hover:bg-white group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40"
                >
                  Recreate
                </button>
              </div>
            );
          })}
          {templateVideos.length === 0 ? (
            <div className="col-span-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/50">
              No template videos found in <code>/public/studio/template</code>.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

