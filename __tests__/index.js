import "@babel/polyfill";

import { Map } from "immutable";
import { createStore } from "redux";

import compose, { justOnce } from "../src";

const addTwo = () => handle =>
  handle("[Number]", next => {
    return next.map(e => e + 2);
  });

const returnAConstant = () => handle => handle("*", next => [1, 2, [3]]);

const somethingThatAddsOneToAScalar = () => handle =>
  handle("Number", next => next + 1);

const retainState = () => handle =>
  handle("*", (next, { useState }) => {
    const [result] = useState(next);
    return result;
  });

it("should be capable of exporting a hooks interface", () => {
  const app = compose().use(handle =>
    handle("*", (hello, { useState }) => {
      const [state] = useState(() => ({ hello }));
      return state;
    })
  );

  const result = app("world");
  const result2 = app("hello");

  expect(result).toEqual({ hello: "world" });
  expect(result2).toEqual({ hello: "world" });

  const app2 = compose().use(handle =>
    handle("*", (nextProps, { useEffect }) => {
      let didChange = false;
      useEffect(() => (didChange = true), [nextProps]);
      return didChange;
    })
  );

  const result3 = app2();
  expect(result3).toEqual(true);
  const result4 = app2();
  expect(result4).toEqual(false);
  const result5 = app2("hi");
  expect(result5).toEqual(true);
  const result6 = app2("hi");
  expect(result6).toEqual(false);
});

it("should parse single arguments in a consistent manner between sync/async execution", async () => {
  const app = compose({ sync: false }).use(handle =>
    handle("*", input => input)
  );

  const app2 = compose().use(handle => handle("*", input => input));

  const result1 = await app("hi");
  const result2 = app2("hi");

  expect(result1).toEqual(result2);
  expect(result1).toEqual("hi");

  const result3 = await app("hi", "bye");
  const result4 = app2("hi", "bye");

  expect(result3).toEqual(result4);
  expect(result3).toEqual(["hi", "bye"]);
});

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

  const app2 = compose({ sync: false })
    .use(addTwo(), addTwo())
    .use(addTwo(), addTwo());

  const result2 = await app2([2], [2]);

  expect(result2).toEqual([[6], [6]]);
});

it("should permit middleware to retain state between executions", async () => {
  const app = compose({ sync: false }).use(retainState());

  const result = await app(500);
  const otherResult = await app(206);

  expect(result).toEqual(500);
  expect(otherResult).toEqual(500);

  const app3 = compose({ sync: false }).use([retainState()]);

  const result3 = await app3([500]);
  const otherResult3 = await app3([206]);

  expect(result3).toEqual(500);
  expect(otherResult3).toEqual(500);

  const app4 = compose({ sync: false }).use(retainState());

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

it("should be possible to use shorthand declarations", () => {
  const app = compose().use("*", input => input + 1);
  const res = app(2);
  expect(res).toEqual(3);
});

it("should be possible to use regular expressions to index objects", () => {
  const reviews = [
    { t: "Hello", s: 0 },
    { t: "Goodbye", s: 1 },
    { t: "Hello2", s: 0.1 },
    { t: "Goodbye2", s: 0.9 }
  ];

  const app = compose().use(/$.*.t/);

  const result = app(reviews);

  expect(result).toEqual(["Hello", "Goodbye", "Hello2", "Goodbye2"]);

  const app2 = compose().use(/$.*.t/, /$.*.s/);

  const result2 = app2(reviews, reviews);

  expect(result2).toEqual([
    ["Hello", "Goodbye", "Hello2", "Goodbye2"],
    [0, 1, 0.1, 0.9]
  ]);

  const app3 = compose().use([/$.*.t/, /$.*.s/]);

  const result3 = app3(reviews);

  expect(result3).toEqual([
    ["Hello", "Goodbye", "Hello2", "Goodbye2"],
    [0, 1, 0.1, 0.9]
  ]);

  const app4 = compose().use([/$.*.t/, /$.*.s/], [/$.*.t/, /$.*.s/]);

  const result4 = app4(reviews, reviews);

  expect(result4).toEqual([
    [
      ["Hello", "Goodbye", "Hello2", "Goodbye2"],
      [0, 1, 0.1, 0.9]
    ],
    [
      ["Hello", "Goodbye", "Hello2", "Goodbye2"],
      [0, 1, 0.1, 0.9]
    ]
  ]);

  const app5 = compose().use([[/$.*.t/], [/$.*.s/]]);

  const result5 = app5(reviews);

  expect(result5).toEqual([
    [["Hello", "Goodbye", "Hello2", "Goodbye2"]],
    [[0, 1, 0.1, 0.9]]
  ]);
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
    handle("*", (next, { useState }) => {
      const [r] = useState(next);
      return r;
    })
  );

  expect(app4("The only value this will ever return.")).toEqual(
    "The only value this will ever return."
  );

  expect(app4("Some other value")).toEqual(
    "The only value this will ever return."
  );

  const app5 = compose().use(/$.*.t/);

  expect(app5([{ t: "hi" }, { t: "bye" }])).toEqual(["hi", "bye"]);

  const app6 = compose().use(/$.*.t/, /$.*.s/);

  expect(app6([{ t: "hi" }], [{ s: 0 }])).toEqual([["hi"], [0]]);

  const app7 = compose().use([/$.*.t/, /$.*.s/]);

  expect(
    app7([
      { t: "hi", s: 0 },
      { t: "bye", s: 1 }
    ])
  ).toEqual([
    ["hi", "bye"],
    [0, 1]
  ]);
});

it("should be possible to execute some middleware only once", () => {
  const app = compose().use(justOnce("*", input => !input));

  const result = app(true);
  const result2 = app(true);
  const result3 = app(true);

  expect(result).toEqual(false);
  expect(result2).toEqual(true);
  expect(result3).toEqual(true);
});

const INCREMENT = "reducer/INCREMENT";
const increment = () => ({ type: INCREMENT });

const buildStore = () => {
  const initialState = Map({ cnt: 0 });
  const reducer = (state = initialState, { type, ...extras }) => {
    switch (type) {
      case INCREMENT:
        return state.set("cnt", state.get("cnt") + 1);
      default:
        return state;
    }
  };
  return createStore(reducer);
};

it("should be possible to implement functional global state", async () => {
  const app = compose(buildStore).use("*", () => true);

  const app2 = compose(buildStore, { sync: false })
    .use("*", (input, { useGlobal }) => {
      const { dispatch } = useGlobal();
      dispatch(increment());
      dispatch(increment());
      dispatch(increment());
      dispatch(increment());
      return input;
    })
    .use("*", (input, { useGlobal }) => {
      const { getState } = useGlobal();
      return getState().get("cnt");
    });

  const a = app();
  const b = await app2().then(e => e + 1);
  const c = await app2().then(e => e + 1);

  const app3 = compose(buildStore)
    .use("*", (_, { useGlobal }) => useGlobal().dispatch(increment()))
    .use(
      justOnce("*", (_, { useGlobal }) =>
        useGlobal()
          .getState()
          .get("cnt")
      )
    );

  expect(a).toEqual(true);
  expect(b).toEqual(5);
  expect(c).toEqual(9);

  expect(app3()).toEqual(1);
});

it("should be possible to access global state from the handler level", () => {
  const app = compose(buildStore).use(handle =>
    handle("*", (_, { useGlobal }) =>
      useGlobal()
        .getState()
        .get("cnt")
    )
  );

  expect(app()).toEqual(0);

  const app2 = compose(buildStore).use((handle, { dispatch }) => {
    dispatch(increment());
    return handle("*", (_, { useGlobal }) =>
      useGlobal()
        .getState()
        .get("cnt")
    );
  });

  expect(app2()).toEqual(1);
});

it("should be possible to declare and consume meta to permit the propagation of hidden properties", () => {
  const numericHandler = () => handle => handle(
    'Number',
    (input, { useMeta }) => {
      useMeta('numeric');
      return input + 1;
    },
  );
  const booleanHandler = () => handle => handle(
    'Boolean',
    (input, { useMeta }) => {
      useMeta('boolean');
      return !input;
    },
  );

  const metaHandler = () => handle => handle('*', (input, { useMeta }) => useMeta());

  const app = compose()
    .use(numericHandler())
    .use(metaHandler());

  expect(app(3)).toEqual('numeric');

  const app2 = compose()
    .use(booleanHandler())
    .use(metaHandler());
  expect(app2(true)).toEqual('boolean');

  const app3 = compose()
    .use(numericHandler(), booleanHandler())
    .use(metaHandler());

  expect(app3(3, true)).toEqual(['numeric', 'boolean']);

  const app4 = compose()
    .use('*', (_, { useMeta }) => useMeta(1, 1));

  expect(() => app4())
    .toThrow();

  const app5 = compose()
    .use('*', (_, { useMeta }) => useMeta());

  expect(app5('This should be undefined.')).toEqual(undefined);
});
