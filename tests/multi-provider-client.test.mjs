import test from "node:test";
import assert from "node:assert/strict";
import { refreshSeconds } from "../public/js/data/multi-provider-client.js";

test("central API refresh interval zero, null, and invalid explicit values never fall back to polling", () => {
  assert.equal(refreshSeconds({ refreshSeconds: 0 }, 15), 0);
  assert.equal(refreshSeconds({ refreshSeconds: "0" }, 15), 0);
  assert.equal(refreshSeconds({ refreshSeconds: null }, 15), 0);
  assert.equal(refreshSeconds({ settings: { refreshSeconds: 0 } }, 15), 0);
  assert.equal(refreshSeconds({ refreshSeconds: "invalid" }, 15), 0);
  assert.equal(refreshSeconds({ refreshConfiguration: { effective: { autoDataRefresh: false } } }, 15), 0);
  assert.equal(refreshSeconds({ settings: { effectiveRefresh: { autoDataRefresh: false } } }, 15), 0);
  assert.equal(refreshSeconds({ settings: { flags: { "Auto Data Refresh": false } } }, 15), 0);
});

test("configured positive refresh intervals are preserved and missing intervals alone use the fallback", () => {
  assert.equal(refreshSeconds({ refreshSeconds: 15 }, 30), 15);
  assert.equal(refreshSeconds({ refreshSeconds: 2 }, 30), 2);
  assert.equal(refreshSeconds({}, 30), 30);
  assert.equal(refreshSeconds({}, 0), 0);
});
