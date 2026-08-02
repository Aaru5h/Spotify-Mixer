import assert from "node:assert/strict";
import { norm, pickBest, dedupeKey } from "./resolve.ts";

// normalisation
assert.equal(norm("Redbone (Official Audio)"), "redbone");
assert.equal(norm("Dreams - 2004 Remaster"), "dreams");
assert.equal(norm("Sunflower (feat. Post Malone)"), "sunflower");
assert.equal(norm("Björk"), "bjork");
assert.equal(norm("Simon & Garfunkel"), "simon and garfunkel");
// non-Latin scripts must survive, or they can never be matched
assert.equal(norm("तुम ही हो"), "तुम ही हो");
assert.notEqual(norm("春よ、来い"), "");

const hit = (title: string, ...artists: string[]) => ({ title, artists });

// exact and near matches resolve
assert.equal(pickBest({ title: "Redbone", artist: "Childish Gambino" }, [hit("Redbone", "Childish Gambino")]), 0);
assert.equal(
  pickBest({ title: "Dreams", artist: "Fleetwood Mac" }, [hit("Dreams - 2004 Remaster", "Fleetwood Mac")]),
  0
);
// collaborator named alone still matches a multi-artist track
assert.equal(pickBest({ title: "Sunflower", artist: "Post Malone" }, [hit("Sunflower", "Swae Lee", "Post Malone")]), 0);

// right title, wrong artist must be rejected — this is the hallucination guard
assert.equal(pickBest({ title: "Dreams", artist: "Fleetwood Mac" }, [hit("Dreams", "Nickelback")]), -1);
// invented track resolves to nothing rather than to a lookalike
assert.equal(pickBest({ title: "Cathedral Static", artist: "Radiohead" }, [hit("Creep", "Radiohead")]), -1);

// picks the best of several rather than the first acceptable one
assert.equal(
  pickBest({ title: "Motion Sickness", artist: "Phoebe Bridgers" }, [
    hit("Motion Sickness - Live", "Phoebe Bridgers"),
    hit("Motion Sickness", "Phoebe Bridgers"),
  ]),
  1
);

// same song, different release → one dedupe key
assert.equal(
  dedupeKey("Fleetwood Mac", "Dreams - 2004 Remaster"),
  dedupeKey("Fleetwood Mac", "Dreams (Remastered)")
);

console.log("resolve: all assertions passed");
