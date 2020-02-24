import "@babel/polyfill";
import jsonpath from "jsonpath";

import compose from "../src";

// TODO: requires some inspection format

it("should throw on invalid invocations", () => {
  expect(() => compose({})).toThrow();
  expect(() => compose(0)).toThrow();
  expect(() => compose(false)).toThrow();
  expect(() => compose([])).toThrow();
  expect(compose(() => null)).toBeTruthy();
});

it("should throw on the specification of too much data", async () => {
  const app = compose()
    .use(/$/);

  expect(app(1, 2))
    .rejects
    .toBeTruthy();
  expect(await app([1])).toBeTruthy();
  expect(await app([1, 2, 3, 4])).toBeTruthy();
});

it("should provide an indexing interface", async () => {
  const app1 = compose()
    .use([/$/]);
  const app2 = compose()
    .use(/$/);
  const app3 = compose()
    .use([[[/$/]]]);
  const r1 = await app1([[1, 2, 3, 4]]);
  const r2 = await app2([1, 2, 3, 4]);
  const r3 = await app3([[[[1, 2, 3, 4]]]]);
  expect(r1).toEqual(r2);
  expect(r1).toEqual(r3);
});
