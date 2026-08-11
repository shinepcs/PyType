import assert from "node:assert/strict";
import test from "node:test";

import {
  findOvertakenCompetitors,
  mergeCompetitionPlayers,
  selectCompetitionMarkers,
} from "../js/ui/render-competition.js";

test("competition merges nearby ranking and online best scores without exposing the current player twice", () => {
  const competitors = mergeCompetitionPlayers({
    playerName: "ME",
    rivals: [
      { playerName: "ME", score: 500, isCurrentUser: true },
      { playerName: "Alpha", score: 700 },
    ],
    onlinePlayers: [
      { playerName: "Alpha", bestScore: 650 },
      { playerName: "Beta", bestScore: 300 },
      { playerName: "ME", bestScore: 900 },
    ],
  });
  assert.deepEqual(competitors, [
    { playerName: "Alpha", score: 700 },
    { playerName: "Beta", score: 300 },
  ]);
});

test("competition lane places rivals by score gap and moves an ahead rival toward YOU", () => {
  const markers = selectCompetitionMarkers([
    { playerName: "FarBehind", score: 100 },
    { playerName: "NearBehind", score: 450 },
    { playerName: "NearAhead", score: 550 },
    { playerName: "FarAhead", score: 900 },
    { playerName: "TooFar", score: 1_200 },
  ], 500);
  assert.deepEqual(markers.map(({ playerName, relation }) => ({ playerName, relation })), [
    { playerName: "FarBehind", relation: "behind" },
    { playerName: "NearBehind", relation: "behind" },
    { playerName: "NearAhead", relation: "ahead" },
    { playerName: "FarAhead", relation: "ahead" },
  ]);
  assert.ok(markers[0].position < markers[1].position);
  assert.ok(markers[2].position < markers[3].position);
  assert.ok(markers[1].position < 50);
  assert.ok(markers[2].position > 50);

  const early = selectCompetitionMarkers([{ playerName: "Target", score: 1_000 }], 100, { perSide: 1 })[0];
  const caughtUp = selectCompetitionMarkers([{ playerName: "Target", score: 1_000 }], 900, { perSide: 1 })[0];
  assert.ok(caughtUp.position < early.position);
  assert.ok(caughtUp.position > 50);
});

test("overtake detection fires only for rivals crossed by the latest score increase", () => {
  const competitors = [
    { playerName: "One", score: 250 },
    { playerName: "Two", score: 400 },
    { playerName: "Three", score: 700 },
  ];
  assert.deepEqual(
    findOvertakenCompetitors(competitors, 200, 500).map((entry) => entry.playerName),
    ["One", "Two"],
  );
  assert.deepEqual(findOvertakenCompetitors(competitors, 500, 500), []);
  assert.deepEqual(findOvertakenCompetitors(competitors, 500, 450), []);
});
