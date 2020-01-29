import "@babel/polyfill";

import compose from "../src";

const addTwo = () => handle =>
  handle("[Number]", (next, last) => {
    return next.map(e => e + 2);
  });

const returnAConstant = () => handle =>
  handle("*", (next, last) => [1, 2, [3]]);

const somethingThatAddsOneToAScalar = () => handle =>
  handle("Number", (next, last) => next + 1);

const retainState = () => handle => handle("*", (next, last) => last || next);

it("should define a composable structure", async () => {
  const app = compose({ sync: false }).use(returnAConstant());
  const res = await app();
  expect(res).toEqual([1, 2, [3]]);
});

it("should not be possible to append new middleware after invoking a function", () => {
  const app = compose().use(handle => handle("*", () => true));
  expect(app()).toBeTruthy();
  expect(() => app.use(handle => handle("*", () => true))).toThrow();
});

it("should export an argument filtering/indexing interface", async () => {
  const app = compose({ sync: false })
    .use(addTwo(), addTwo())
    .use(addTwo(), addTwo())
    .use(returnAConstant())
    .use(
      [somethingThatAddsOneToAScalar()],
      [somethingThatAddsOneToAScalar()],
      [[somethingThatAddsOneToAScalar()]]
    );

  const result = await app([2], [2]);

  expect(result).toEqual([2, 3, 4]);
});

it("should permit middleware to retain state between executions", async () => {
  const app = compose({ sync: false }).use([retainState()]);

  const result = await app(500);
  const otherResult = await app(206);

  expect(result).toEqual(500);
  expect(otherResult).toEqual(500);

  const app2 = compose({ sync: false }).use(retainState());

  const result2 = await app2(500);
  const otherResult2 = await app2(206);

  expect(result2).toEqual([500]);
  expect(otherResult2).toEqual([500]);

  const app3 = compose({ sync: false }).use([[retainState()]]);

  const result3 = await app3([500]);
  const otherResult3 = await app3([206]);

  expect(result3).toEqual(500);
  expect(otherResult3).toEqual(500);

  const app4 = compose({ sync: false }).use([retainState(), retainState()]);

  const result4 = await app4([500, 501]);
  const otherResult4 = await app4([206, 207]);

  expect(result4).toEqual([500, 501]);
  expect(otherResult4).toEqual([500, 501]);

  const app5 = compose({ sync: false }).use([retainState()]);

  const result5 = await app5(500, 100);

  expect(result5).toEqual(500);
});

it("should allow you to define custom matcher functions", () => {
  const customMatcher = input => input === "secret";
  const app = compose().use(handle => handle(customMatcher, () => true));

  expect(() => app("hello")).toThrow();
  expect(app("secret")).toBeTruthy();
});

it("should propagate scalar values in a common-sense way", () => {
  const app = compose()
    .use(handle => handle("Number", n => n + 1))
    .use(handle => handle("Number", n => n + 1));

  expect(app(1)).toEqual(3);
});

it("should be capable of executing the example code", () => {
  const app = compose().use(handle => handle("*", () => "Hello, world!"));

  expect(app()).toEqual("Hello, world!");

  const app2 = compose().use(handle => {
    handle("String", () => "You passed a string!");
    handle("*", () => "You didn't pass a string!");
  });

  expect(app2("This is a string.")).toEqual("You passed a string!");
  expect(app2({ life: 42 })).toEqual("You didn't pass a string!");

  const addOneToANumber = () => handle => handle("Number", n => n + 1);

  const app3 = compose().use([addOneToANumber()]);

  expect(app3([2])).toEqual(3);

  const app4 = compose().use(handle =>
    handle("*", (next, last) => last || next)
  );

  expect(app4("The only value this will ever return.")).toEqual(
    "The only value this will ever return."
  );

  expect(app4("Some other value")).toEqual(
    "The only value this will ever return."
  );
});
