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

test("competition lane places the nearest lower and higher scores on opposite sides of YOU", () => {
  const markers = selectCompetitionMarkers([
    { playerName: "FarBehind", score: 100 },
    { playerName: "NearBehind", score: 450 },
    { playerName: "NearAhead", score: 550 },
    { playerName: "FarAhead", score: 900 },
    { playerName: "TooFar", score: 1_200 },
  ], 500);
  assert.deepEqual(markers.map(({ playerName, relation, position }) => ({ playerName, relation, position })), [
    { playerName: "FarBehind", relation: "behind", position: 18 },
    { playerName: "NearBehind", relation: "behind", position: 34 },
    { playerName: "NearAhead", relation: "ahead", position: 66 },
    { playerName: "FarAhead", relation: "ahead", position: 82 },
  ]);
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
