import "@babel/polyfill";

import { Map } from "immutable";
import { createStore } from "redux";

import compose, { isRippleware, justOnce, print, noop } from "../src";

const addOne = () => input => input + 1;

const retainState = () => (input, { useState }) => {
  const [state] = useState(input);
  return state;
};

const truthyOnChange = () => (input, { useEffect }) => {
  let changed = false;
  useEffect(
    () => {
      changed = true;
    },
    [input],
  );
  return changed;
};

it("should be possible to define a matcher array", async () => {
  const app = compose()
    .use(
      [
        ['Number', () => 'This is a number.'],
        ['[Number]', () => 'This is an array of numbers.'],
        ['*', () => 'Something else.'],
      ],
    );

  expect(await app(0)).toEqual(['This is a number.']);
  expect(await app([0])).toEqual(['This is an array of numbers.']);
  expect(await app(true)).toEqual(['Something else.']);

  const app2 = compose()
    .use(
      compose()
        .use(
          [
            [input => input > 0.5, () => 'Greater!'],
            ['[Number]', () => 'This is also an array of numbers.'],
          ],
        ),
    );

  expect(await app2(1)).toEqual(['Greater!']);
  expect(app2(0.49))
    .rejects
    .toBeTruthy();
  expect(await app2([1, 2, 3])).toEqual(['This is also an array of numbers.']);
});

it("should be possible to use regular expressions to index on supplied data", async () => {
  const imdb = [
    {
      t: 'Good!',
      s: 1,
    },
    {
      t: 'Bad!',
      s: 0,
    },
  ];
  const app = compose()
    .sep([/$.*.t/, /$.*.s/]);

  expect(await app(imdb)).toEqual([['Good!', 'Bad!'], [1, 0]]);
});

it("should be possible to aggregate multiple middleware actions against a single channel of data", async () => {
  const app = compose()
    .use(
      [addOne(), addOne()],
    );
  expect(await app(1)).toEqual([[2, 2]]);

  const app2 = compose()
    .use(
      compose()
        .use(
          [addOne(), addOne()],
        ),
    );
  expect(await app2(1)).toEqual([[2, 2]]);

  const app3 = compose()
    .use(
      compose()
        .use(
          [addOne(), addOne()],
          [addOne(), addOne()],
        ),
    );

  expect(await app3(1, 2)).toEqual([[2, 2], [3, 3]]);
});

it("should be capable of providing a useState hook", async () => {
  const app = compose()
    .use(retainState());

  // TODO: It looks like we can't persist truthy values.
  expect(await app(0)).toEqual([0]);
  expect(await app(2)).toEqual([0]);

  const app2 = compose()
    .use(retainState(), retainState())
    .use(
      compose()
        .use(retainState(), retainState()),
    );

  expect(await app2(3, 4)).toEqual([3, 4]);
  expect(await app2(5, 6)).toEqual([3, 4]);
});

it("should be capable of providing a useEffect hook", async () => {
  const app = compose()
    .use(truthyOnChange());

  expect(await app(0)).toEqual([true]);
  expect(await app(0)).toEqual([false]);
  expect(await app(0)).toEqual([false]);
  expect(await app(1)).toEqual([true]);
  expect(await app(1)).toEqual([false]);
  expect(await app(1)).toEqual([false]);
  expect(await app(0)).toEqual([true]);
  expect(await app(0)).toEqual([false]);
  expect(await app(0)).toEqual([false]);
});

it("should not be possible to append new middleware after invocation, but the instance must still *look* like rippleware", async () => {
  const app = compose()
    .use(() => true);

  expect(await app(undefined)).toEqual([true]);

  expect(() => app.use(() => true)).toThrow();
  expect(() => app.sep(() => true)).toThrow();

  expect(isRippleware(app)).toEqual(true);
});

//it("should allow you to define custom matcher functions", async () => {
//  const customMatcher = input => input === "secret";
//  const app = compose().use(handle => handle(customMatcher, () => true));
//
//  expect(await app("secret")).toEqual(true);
//  expect(app("hello")).rejects.toBeTruthy();
//});
//
//it("should propagate scalar values in a common-sense way", async () => {
//  const app = compose()
//    .use(handle => handle("Number", n => n + 1))
//    .use(handle => handle("Number", n => n + 1));
//
//  expect(await app(1)).toEqual(3);
//});
//
//it("should be possible to use shorthand declarations", async () => {
//  const app = compose().use("*", input => input + 1);
//  const res = await app(2);
//  expect(res).toEqual(3);
//});
//
//it("should be possible to use regular expressions to index objects", async () => {
//  const reviews = [
//    { t: "Hello", s: 0 },
//    { t: "Goodbye", s: 1 },
//    { t: "Hello2", s: 0.1 },
//    { t: "Goodbye2", s: 0.9 }
//  ];
//
//  const app = compose().use(/$.*.t/);
//
//  const result = await app(reviews);
//
//  expect(result).toEqual(["Hello", "Goodbye", "Hello2", "Goodbye2"]);
//
//  const app2 = compose().use(/$.*.t/, /$.*.s/);
//
//  const result2 = await app2(reviews, reviews);
//
//  expect(result2).toEqual([
//    ["Hello", "Goodbye", "Hello2", "Goodbye2"],
//    [0, 1, 0.1, 0.9]
//  ]);
//
//  const app3 = compose().use([/$.*.t/, /$.*.s/]);
//
//  const result3 = await app3(reviews);
//
//  expect(result3).toEqual([
//    ["Hello", "Goodbye", "Hello2", "Goodbye2"],
//    [0, 1, 0.1, 0.9]
//  ]);
//
//  const app4 = compose().use([/$.*.t/, /$.*.s/], [/$.*.t/, /$.*.s/]);
//
//  const result4 = await app4(reviews, reviews);
//
//  expect(result4).toEqual([
//    [
//      ["Hello", "Goodbye", "Hello2", "Goodbye2"],
//      [0, 1, 0.1, 0.9]
//    ],
//    [
//      ["Hello", "Goodbye", "Hello2", "Goodbye2"],
//      [0, 1, 0.1, 0.9]
//    ]
//  ]);
//
//  const app5 = compose().use([[/$.*.t/], [/$.*.s/]]);
//
//  const result5 = await app5(reviews);
//
//  expect(result5).toEqual([
//    [["Hello", "Goodbye", "Hello2", "Goodbye2"]],
//    [[0, 1, 0.1, 0.9]]
//  ]);
//});
//
//it("should be capable of executing the example code", async () => {
//  const app = compose().use(handle => handle("*", () => "Hello, world!"));
//
//  expect(await app()).toEqual("Hello, world!");
//
//  const app2 = compose().use(handle => {
//    handle("String", () => "You passed a string!");
//    handle("*", () => "You didn't pass a string!");
//  });
//
//  expect(await app2("This is a string.")).toEqual("You passed a string!");
//  expect(await app2({ life: 42 })).toEqual("You didn't pass a string!");
//
//  const addOneToANumber = () => handle => handle("Number", n => n + 1);
//
//  const app3 = compose().use([addOneToANumber()]);
//
//  expect(await app3([2])).toEqual(3);
//
//  const app4 = compose().use(handle =>
//    handle("*", (next, { useState }) => {
//      const [r] = useState(next);
//      return r;
//    })
//  );
//
//  expect(await app4("The only value this will ever return.")).toEqual(
//    "The only value this will ever return."
//  );
//
//  expect(await app4("Some other value")).toEqual(
//    "The only value this will ever return."
//  );
//
//  const app5 = compose().use(/$.*.t/);
//
//  expect(await app5([{ t: "hi" }, { t: "bye" }])).toEqual(["hi", "bye"]);
//
//  const app6 = compose().use(/$.*.t/, /$.*.s/);
//
//  expect(await app6([{ t: "hi" }], [{ s: 0 }])).toEqual([["hi"], [0]]);
//
//  const app7 = compose().use([/$.*.t/, /$.*.s/]);
//
//  expect(
//    await app7([
//      { t: "hi", s: 0 },
//      { t: "bye", s: 1 }
//    ])
//  ).toEqual([
//    ["hi", "bye"],
//    [0, 1]
//  ]);
//
//  const app8 = compose().use(somethingThatAddsOneToAScalar(), noop());
//
//  expect(await app8(0, 0)).toEqual([1, 0]);
//
//  const app9 = compose()
//    .use([somethingThatAddsOneToAScalar(), noop()]);
//
//  expect(await app9([0, 1])).toEqual([1, 1]);
//
//});
//
//it("should be possible to execute some middleware only once", async () => {
//  const app = compose().use(justOnce("*", input => !input));
//
//  const result = await app(true);
//  const result2 = await app(true);
//  const result3 = await app(true);
//
//  expect(result).toEqual(false);
//  expect(result2).toEqual(true);
//  expect(result3).toEqual(true);
//});
//
//const INCREMENT = "reducer/INCREMENT";
//const increment = () => ({ type: INCREMENT });
//
//const buildStore = () => {
//  const initialState = Map({ cnt: 0 });
//  const reducer = (state = initialState, { type, ...extras }) => {
//    switch (type) {
//      case INCREMENT:
//        return state.set("cnt", state.get("cnt") + 1);
//      default:
//        return state;
//    }
//  };
//  return createStore(reducer);
//};
//
//it("should be possible to implement functional global state", async () => {
//  const app = compose(buildStore).use("*", () => true);
//
//  const app2 = compose(buildStore)
//    .use("*", (input, { useGlobal }) => {
//      const { dispatch } = useGlobal();
//      dispatch(increment());
//      dispatch(increment());
//      dispatch(increment());
//      dispatch(increment());
//      return input;
//    })
//    .use("*", (input, { useGlobal }) => {
//      const { getState } = useGlobal();
//      return getState().get("cnt");
//    });
//
//  const a = await app();
//  const b = await app2().then(e => e + 1);
//  const c = await app2().then(e => e + 1);
//
//  const app3 = compose(buildStore)
//    .use("*", (_, { useGlobal }) => useGlobal().dispatch(increment()))
//    .use(
//      justOnce("*", (_, { useGlobal }) =>
//        useGlobal()
//          .getState()
//          .get("cnt")
//      )
//    );
//
//  expect(a).toEqual(true);
//  expect(b).toEqual(5);
//  expect(c).toEqual(9);
//
//  expect(await app3()).toEqual(1);
//});
//
//it("should be possible to access global state from the handler level", async () => {
//  const app = compose(buildStore).use(handle =>
//    handle("*", (_, { useGlobal }) =>
//      useGlobal()
//        .getState()
//        .get("cnt")
//    )
//  );
//
//  expect(await app()).toEqual(0);
//
//  const app2 = compose(buildStore).use((handle, { dispatch }) => {
//    dispatch(increment());
//    return handle("*", (_, { useGlobal }) =>
//      useGlobal()
//        .getState()
//        .get("cnt")
//    );
//  });
//
//  expect(await app2()).toEqual(1);
//});
//
//it("should be possible to declare and consume meta to permit the propagation of hidden properties", async () => {
//  const numericHandler = () => handle =>
//    handle("Number", (input, { useMeta }) => {
//      useMeta("numeric");
//      return input + 1;
//    });
//  const booleanHandler = () => handle =>
//    handle("Boolean", (input, { useMeta }) => {
//      useMeta("boolean");
//      return !input;
//    });
//
//  const metaHandler = () => handle =>
//    handle("*", (input, { useMeta }) => useMeta());
//
//  const app = compose()
//    .use(numericHandler())
//    .use(metaHandler());
//
//  expect(await app(3)).toEqual("numeric");
//
//  const app2 = compose()
//    .use(booleanHandler())
//    .use(metaHandler());
//  expect(await app2(true)).toEqual("boolean");
//
//  const app3 = compose()
//    .use(numericHandler(), booleanHandler())
//    .use(metaHandler());
//
//  expect(await app3(3, true)).toEqual(["numeric", "boolean"]);
//
//  const app4 = compose().use("*", (_, { useMeta }) => useMeta(1, 1));
//
//  const app5 = compose().use("*", (_, { useMeta }) => useMeta());
//
//  expect(await app5("This should be undefined.")).toEqual(undefined);
//
//  const app6 = compose()
//    .use("*", (_, { useMeta }) => useMeta({ a: 2 }))
//    .use("*", (_, { useMeta }) => (useMeta().a = 4));
//
//  expect(app6()).rejects.toBeTruthy();
//});
//
//it("should be able to intuitively nest middleware layers", async () => {
//  const app = compose()
//    .use("*", b => !b)
//    .use(compose().use("*", b => !b));
//
//  expect(await app()).toEqual(false);
//  expect(await app(true)).toEqual(true);
//  expect(await app(false)).toEqual(false);
//
//  const app2 = compose(buildStore)
//    .use("*", (input, { useGlobal }) => {
//      const { dispatch } = useGlobal();
//      dispatch(increment());
//      return !input;
//    })
//    .use(
//      compose().use("*", (input, { useGlobal }) => {
//        return useGlobal()
//          .getState()
//          .get("cnt");
//      })
//    );
//
//  expect(await app2()).toEqual(1);
//
//  const app3 = compose()
//    .use("*", (input, { useMeta }) => {
//      useMeta({ hello: "world" });
//      return !input;
//    })
//    .use(
//      compose().use("*", (input, { useMeta }) => {
//        return useMeta();
//      })
//    );
//
//  expect(await app3()).toEqual({ hello: "world" });
//
//  const subApp = compose().use("*", input => !input);
//
//  const app4 = compose().use(subApp, subApp);
//
//  expect(await app4(true, false)).toEqual([false, true]);
//
//  const applyMeta1 = () => handle =>
//    handle("*", (input, { useMeta }) => {
//      useMeta(1);
//      return !input;
//    });
//
//  const applyMeta2 = () => handle =>
//    handle("*", (input, { useMeta }) => {
//      useMeta(2);
//      return !input;
//    });
//
//  // TODO: Meta should be segmented!
//  const app5 = compose()
//    .use(applyMeta1(), applyMeta2())
//    .use(
//      compose().use("*", (input, { useMeta }) => {
//        return useMeta();
//      }),
//      compose().use("*", (input, { useMeta }) => {
//        return useMeta();
//      })
//    );
//
//  const app6 = compose(buildStore).use(
//    compose(() => ({ hello: "world" })).use("*", (input, { useGlobal }) =>
//      useGlobal()
//    )
//  );
//
//  expect(await app6()).toEqual({ hello: "world" });
//});
//
//it("should be possible to determine the topology of execution", async () => {
//  const app = compose()
//    .use("*", b => !b)
//    .use("*", b => !b)
//    .use("*", (input, { useTopology }) => useTopology());
//
//  expect(await app()).toEqual([2, 3]);
//
//  const app2 = compose()
//    .use("*", b => !b)
//    .use(compose().use("*", (_, { useTopology }) => useTopology()))
//    .use("*", b => b);
//
//  expect(await app2()).toEqual([0, 1]);
//});
//
//it("should be possible for nested meta to propagate back into the parent execution context", async () => {
//  const metaApp = () =>
//    compose().use("Boolean", (input, { useMeta }) => {
//      useMeta("hello");
//      return !input;
//    });
//
//  const app = compose()
//    .use(metaApp(), metaApp(), metaApp())
//    .use("*", (_, { useMeta }) => useMeta());
//
//  expect(await app(true, false, true)).toEqual(["hello", "hello", "hello"]);
//  expect(await app(false, true, false)).toEqual(["hello", "hello", "hello"]);
//});
//
//it("should be possible to print debug information about a given state", async () => {
//  const app = compose()
//    .use("Boolean", (input, { useMeta }) => {
//      useMeta("Some meta information.");
//      return [input, !input];
//    })
//    .use(print(), print());
//
//  expect(await app(false)).toEqual([false, true]);
//});
//
//it("should permit noop operations", async () => {
//  const app = compose().use(handle => handle("Number", i => i + 1), noop());
//
//  expect(await app(1, 1)).toEqual([2, 1]);
//});
//
//it("should permit shorthand matcher declarations", async () => {
//  const app = compose().use(h => h(b => !b));
//
//  expect(await app(true)).toEqual(false);
//});
//
//it("should permit the propagation of meta after calls to print() and justOnce()", async () => {
//  const app = compose()
//    .use(h =>
//      h((input, { useMeta }) => {
//        useMeta(input);
//        return null;
//      })
//    )
//    .use(justOnce(justOnce(justOnce(print()))))
//    .use(print())
//    .use(noop())
//    .use(noop())
//    .use(justOnce(justOnce(noop())))
//    .use(h => h((input, { useMeta }) => useMeta()));
//
//  expect(await app(3)).toBe(3);
//  expect(await app(4)).toBe(4);
//});
//
//it("should permit extended parameter declarations", async () => {
//  const app = compose()
//    .use(noop(), noop());
//  expect(await app([1, 2])).toEqual([[1, 2], undefined]);
//});
//
//
//it("should reconcile difficult configurations like this", async () => {
//  const app = compose()
//    .use(
//      noop(),
//      noop(),
//      noop(),
//    );
//
//  expect(await app(0,0,0)).toEqual([0,0,0]);
//  expect(await app([0],[0],[0])).toEqual([[0],[0],[0]]);
//  expect(await app([0, 0],0,[0])).toEqual([[0, 0],0,[0]]);
//  expect(await app([1, 0], 1)).toEqual([ [ 1, 0 ], 1, undefined ]);
//
//  const app2 = compose()
//    .use(
//      compose()
//        .use(noop(), noop(), noop()),
//    );
//
//  expect(await app2(1,2,3)).toEqual([1,2,3]);
//});
