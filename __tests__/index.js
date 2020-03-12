import "@babel/polyfill";

import { typeCheck } from "type-check";
import { Map } from "immutable";
import { createStore } from "redux";

import compose, { isRippleware, justOnce, noop, pre } from "../src";

const addOne = () => input => input + 1;

const retainState = () => (input, { useState }) => {
  const [state] = useState(input);
  return state;
};

const truthyOnChange = () => (input, { useEffect }) => {
  let changed = false;
  useEffect(() => {
    changed = true;
  }, [input]);
  return changed;
};

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

const imdb = Object.freeze([
  {
    t: "Good!",
    s: 1
  },
  {
    t: "Bad!",
    s: 0
  }
]);

it("should allow the propagation of the useMeta hook", async () => {
  const app = compose()
    .use((input, { useMeta }) => useMeta(5))
    .use((input, { useMeta }) => useMeta());

  expect(await app()).toEqual([5]);

  const app2 = compose()
    .use((_, { useMeta }) => useMeta(5))
    .use(compose().use((_, { useMeta }) => useMeta()));

  expect(await app2()).toEqual([5]);

  const app3 = compose()
    .use((_, { useMeta }) => useMeta(5))
    .use(
      compose().use(
        (_, { useMeta }) => useMeta(),
        (_, { useMeta }) => useMeta(),
        (_, { useMeta }) => useMeta()
      )
    );

  expect(await app3()).toEqual([5, 5, 5]);

  const app4 = compose()
    .use((_, { useMeta }) => useMeta(5))
    .use(() => null)
    .use(() => null)
    .use(() => null)
    .use((_, { useMeta }) => useMeta());

  expect(await app4()).toEqual([5]);

  const app5 = compose()
    .use(
      (_, { useMeta }) => useMeta(100),
      compose().use((_, { useMeta }) => useMeta(10))
    );
    //.sep(
    //  (_, { useMeta }) => useMeta(),
    //  (_, { useMeta }) => useMeta()
    //);

  console.log(await app5());
  //expect(await app5()).toEqual([100, 10]);
});

//it("should be possible to define a matcher array", async () => {
//  const app = compose().use([
//    ["Number", () => "This is a number."],
//    ["[Number]", () => "This is an array of numbers."],
//    ["*", () => "Something else."]
//  ]);
//
//  expect(await app(0)).toEqual(["This is a number."]);
//  expect(await app([0])).toEqual(["This is an array of numbers."]);
//  expect(await app(true)).toEqual(["Something else."]);
//
//  const app2 = compose().use(
//    compose().use([
//      [input => input > 0.5, () => "Greater!"],
//      ["[Number]", () => "This is also an array of numbers."]
//    ])
//  );
//
//  expect(await app2(1)).toEqual(["Greater!"]);
//  expect(app2(0.49)).rejects.toBeTruthy();
//  expect(await app2([1, 2, 3])).toEqual(["This is also an array of numbers."]);
//});
//
//it("should be possible to use regular expressions to index on supplied data", async () => {
//  const app = compose().all([/$.*.t/, /$.*.s/]);
//
//  expect(await app(imdb)).toEqual([
//    ["Good!", "Bad!"],
//    [1, 0]
//  ]);
//});
//
//it("should be possible to aggregate multiple middleware actions against a single channel of data", async () => {
//  const app = compose().use([addOne(), addOne()]);
//  expect(await app(1)).toEqual([[2, 2]]);
//
//  const app2 = compose().use(compose().use([addOne(), addOne()]));
//  expect(await app2(1)).toEqual([[2, 2]]);
//
//  const app3 = compose().use(
//    compose().use([addOne(), addOne()], [addOne(), addOne()])
//  );
//
//  expect(await app3(1, 2)).toEqual([
//    [2, 2],
//    [3, 3]
//  ]);
//});
//
//it("should be capable of providing a useState hook", async () => {
//  const app = compose().use(retainState());
//
//  // TODO: It looks like we can't persist truthy values.
//  expect(await app(0)).toEqual([0]);
//  expect(await app(2)).toEqual([0]);
//
//  const app2 = compose()
//    .use(retainState(), retainState())
//    .use(compose().use(retainState(), retainState()));
//
//  expect(await app2(3, 4)).toEqual([3, 4]);
//  expect(await app2(5, 6)).toEqual([3, 4]);
//});
//
//it("should be capable of providing a useEffect hook", async () => {
//  const app = compose().use(truthyOnChange());
//
//  expect(await app(0)).toEqual([true]);
//  expect(await app(0)).toEqual([false]);
//  expect(await app(0)).toEqual([false]);
//  expect(await app(1)).toEqual([true]);
//  expect(await app(1)).toEqual([false]);
//  expect(await app(1)).toEqual([false]);
//  expect(await app(0)).toEqual([true]);
//  expect(await app(0)).toEqual([false]);
//  expect(await app(0)).toEqual([false]);
//});
//
//it("should not be possible to append new middleware after invocation, but the instance must still *look* like rippleware", async () => {
//  const app = compose().use(() => true);
//
//  expect(await app(undefined)).toEqual([true]);
//
//  expect(() => app.use(() => true)).toThrow();
//  expect(() => app.all(() => true)).toThrow();
//
//  expect(isRippleware(app)).toEqual(true);
//});
//
//it("should propagate values in a common-sense way", async () => {
//  const app = compose().use(
//    i => i,
//    i => i,
//    i => i
//  );
//
//  expect(await app(1, 2, 3)).toEqual([1, 2, 3]);
//
//  const app2 = compose()
//    .use(
//      i => i,
//      i => i
//    )
//    .use(
//      compose().use(
//        compose().use(
//          i => i,
//          i => i
//        )
//      )
//    );
//
//  expect(await app2(1, 2)).toEqual([1, 2]);
//
//  const app3 = compose().use(i => i);
//
//  expect(await app3(3)).toEqual([3]);
//
//  expect(app3(3, 5)).rejects.toBeTruthy();
//
//  const app4 = compose()
//    .use(
//      i => i,
//      i => i
//    )
//    .use(
//      compose().use(
//        i => i,
//        i => i
//      )
//    );
//
//  expect(await app4(1)).toEqual([1, undefined]);
//});
//
//it("must support the instantiation and propagation of global state", async () => {
//  const app = compose(buildStore)
//    .use((_, { useGlobal }) => {
//      const { dispatch } = useGlobal();
//      dispatch(increment());
//      return null;
//    })
//    .use((_, { useGlobal }) => {
//      const { getState } = useGlobal();
//      const cnt = getState().get("cnt");
//      return cnt;
//    });
//
//  expect(await app()).toEqual([1]);
//  expect(await app()).toEqual([2]);
//  expect(await app()).toEqual([3]);
//
//  const app2 = compose(buildStore)
//    .use(
//      compose().use((_, { useGlobal }) => {
//        const { dispatch } = useGlobal();
//        dispatch(increment());
//        return null;
//      })
//    )
//    .use((_, { useGlobal }) => {
//      const { getState } = useGlobal();
//      const cnt = getState().get("cnt");
//      return cnt;
//    });
//
//  expect(await app2()).toEqual([1]);
//  expect(await app2()).toEqual([2]);
//  expect(await app2()).toEqual([3]);
//});
//
//it("must not override the global state of nested middleware if they have one defined", async () => {
//  const app = compose(buildStore).use(
//    compose(buildStore)
//      .use((_, { useGlobal }) => {
//        const { dispatch } = useGlobal();
//        dispatch(increment());
//        return null;
//      })
//      .use((_, { useGlobal }) => {
//        const { getState } = useGlobal();
//        const cnt = getState().get("cnt");
//        return cnt;
//      })
//  );
//
//  expect(await app()).toEqual([1]);
//  expect(await app()).toEqual([2]);
//  expect(await app()).toEqual([3]);
//
//  const app2 = compose(buildStore)
//    .use(
//      compose(buildStore).use((_, { useGlobal }) => {
//        const { dispatch } = useGlobal();
//        dispatch(increment());
//        return null;
//      })
//    )
//    .use((_, { useGlobal }) => {
//      const { getState } = useGlobal();
//      const cnt = getState().get("cnt");
//      return cnt;
//    });
//
//  expect(await app2()).toEqual([0]);
//  expect(await app2()).toEqual([0]);
//  expect(await app2()).toEqual([0]);
//});
//
//it("should be possible to determine the topology of execution using useTopology", async () => {
//  const app = compose().use((_, { useTopology }) => useTopology());
//
//  expect(await app()).toEqual([[0, 1]]);
//
//  const app2 = compose().use(
//    compose()
//      .use(() => null)
//      .use(() => null)
//      .use((_, { useTopology }) => useTopology())
//  );
//
//  expect(await app2()).toEqual([[2, 3]]);
//});
//
//it("should be possible to execute some middleware only once", async () => {
//  const app = compose().use(justOnce(i => !i));
//
//  expect(await app(true)).toEqual([false]);
//  expect(await app(true)).toEqual([true]);
//  expect(await app(false)).toEqual([false]);
//
//  const app2 = compose().use(compose().use(justOnce(i => !i)));
//
//  expect(await app2(true)).toEqual([false]);
//  expect(await app2(true)).toEqual([true]);
//  expect(await app2(false)).toEqual([false]);
//
//  const app3 = compose()
//    .use((_, { useMeta }) => useMeta(4))
//    .use(compose().use(justOnce(() => null)))
//    .use((_, { useMeta }) => useMeta());
//
//  expect(await app3(null)).toEqual([4]);
//});
//
//it("should be possible to define skipped channels of computation", async () => {
//  const app = compose()
//    .use(noop(), noop())
//    .use(noop(), i => i + 1)
//    .use(i => i + 2, noop());
//
//  expect(await app(1, 2)).toEqual([3, 3]);
//});
//
//it("should be possible to dynamically generate parameters based upon pre-evaluation of available data", async () => {
//  expect(() => compose().pre(/$.*/)).toThrow();
//  expect(compose().pre(() => null)).toBeTruthy();
//
//  const app = compose(buildStore).pre(
//    ({ useGlobal }) => {
//      const { getState } = useGlobal();
//      const cnt = getState().get("cnt");
//      return () => cnt;
//    },
//    ({ useGlobal }) => {
//      const { getState } = useGlobal();
//      const cnt = getState().get("cnt");
//      return () => cnt;
//    }
//  );
//
//  expect(await app()).toEqual([0, 0]);
//
//  const app2 = compose(buildStore)
//    .use((_, { useGlobal }) =>
//      useGlobal()
//        .getState()
//        .get("cnt")
//    )
//    .pre(({ useGlobal }) => {
//      const { dispatch } = useGlobal();
//      dispatch(increment());
//      return i => i;
//    });
//
//  expect(await app2()).toEqual([1]);
//  expect(await app2()).toEqual([1]);
//
//  const app3 = compose().pre(
//    () => [
//      ["Number", () => "A number!"],
//      ["Object", () => "An object!"]
//    ],
//    () => [
//      ["Number", () => "A number!"],
//      ["Object", () => "An object!"]
//    ]
//  );
//
//  expect(await app3(0, {})).toEqual(["A number!", "An object!"]);
//  expect(await app3({}, 0)).toEqual(["An object!", "A number!"]);
//
//  const app4 = compose().pre(
//    () => [i => i, i => i],
//    () => [i => i, i => i]
//  );
//
//  expect(await app4(5)).toEqual([
//    [5, 5],
//    [undefined, undefined]
//  ]);
//});
//
//it("should be possible to use pre-evaluation on individual parameters", async () => {
//  const app = compose(buildStore)
//    .use((_, { useGlobal }) => {
//      const { dispatch } = useGlobal();
//      dispatch(increment());
//      return null;
//    })
//    .use(
//      pre(({ useGlobal }) => {
//        const { getState } = useGlobal();
//        const cnt = getState().get("cnt");
//        return () => cnt;
//      })
//    );
//
//  expect(await app()).toEqual([0]);
//
//  const app2 = compose().use(
//    pre(() => i => i),
//    pre(() => i => i)
//  );
//
//  expect(await app2()).toEqual([undefined, undefined]);
//
//  const app3 = compose(buildStore)
//    .use((_, { useGlobal }) =>
//      useGlobal()
//        .getState()
//        .get("cnt")
//    )
//    .use(
//      pre(({ useGlobal }) => {
//        const { dispatch } = useGlobal();
//        dispatch(increment());
//        return i => i;
//      })
//    );
//
//  expect(await app3()).toEqual([1]);
//  expect(await app3()).toEqual([1]);
//});
//
//it("should be possible to aggregate object indexing across a single term", async () => {
//  const app = compose().use([[/$.*.t/, /$.*.s/], [/$.*.s/]]);
//
//  expect(await app(imdb)).toEqual([
//    [
//      [
//        ["Good!", "Bad!"],
//        [1, 0]
//      ],
//      [[1, 0]]
//    ]
//  ]);
//});
//
//it("should be possible to merge channels", async () => {
//  const passWithSomeMeta = n => (i, { useMeta }) => {
//    useMeta(n);
//    return i;
//  };
//
//  const app = compose()
//    .mix(passWithSomeMeta(1), passWithSomeMeta(2))
//    .use(compose().use(i => i));
//
//  expect(await app({ a: 1 }, { b: 2 })).toEqual([[{ a: 1 }, { b: 2 }]]);
//
//  const app2 = compose()
//    .mix(passWithSomeMeta(1), passWithSomeMeta(2))
//    .use(compose().use((_, { useMeta }) => useMeta()));
//
//  expect(await app2({ a: 1 }, { b: 2 })).toEqual([[1, 2]]);
//});
//
//it("should be possible to inherit all parameters for a middleware step", async () => {
//  const app = compose()
//    .use(
//      i => i,
//      i => i,
//      i => i
//    )
//    .all(
//      i => i,
//      i => i,
//      /$.*.a/
//    )
//    .use(
//      i => i,
//      i => i,
//      i => i
//    );
//
//  expect(await app(3, 4, { a: 1 })).toEqual([
//    [3, 4, { a: 1 }],
//    [3, 4, { a: 1 }],
//    [1]
//  ]);
//
//  const someAggregator = () => i => i;
//
//  const app2 = compose().all(someAggregator(), someAggregator());
//
//  expect(await app2(1, 2)).toEqual([
//    [1, 2],
//    [1, 2]
//  ]);
//
//  const app3 = compose().all(someAggregator());
//
//  expect(await app3(1, 2)).toEqual([1, 2]);
//
//  const app4 = compose().use(compose().all(someAggregator(), someAggregator()));
//
//  expect(await app4(1, 2)).toEqual([
//    [1, 2],
//    [1, 2]
//  ]);
//
//  const app5 = compose().use(compose().all(someAggregator()));
//
//  expect(await app5(1, 2)).toEqual([1, 2]);
//});
//
//it("should appropriately split meta", async () => {
//  //const app = compose()
//  //  .use(
//  //    (i, { useMeta }) => {
//  //      useMeta("Hello!");
//  //      return i;
//  //    },
//  //    (i, { useMeta }) => {
//  //      useMeta("Goodbye!");
//  //      return i;
//  //    }
//  //  )
//  //  .sep(
//  //    [(i, { useMeta }) => useMeta(), (i, { useMeta }) => useMeta()],
//  //    [(i, { useMeta }) => useMeta(), (i, { useMeta }) => useMeta()]
//  //  );
//
//  //expect(await app(1, 2)).toEqual(["Hello!", "Hello!", "Goodbye!", "Goodbye!"]);
//
//  const app2 = compose()
//    .use(
//      (input, { useMeta }) => {
//        useMeta("Hello!");
//        return input;
//      },
//      (input, { useMeta }) => {
//        useMeta("Goodbye!");
//        return input;
//      }
//    )
//    .use([[/$.*.hi/], [/$.*.bye/]], [[/$.*.hi/], [/$.*.bye/]])
//    .use(
//      (i, { useMeta }) => useMeta(),
//      (i, { useMeta }) => useMeta()
//    );
//
//  expect(
//    await app2([{ hi: "Hi!", bye: "Bye!" }], [{ hi: "Hi!", bye: "Bye!" }])
//  ).toEqual(["Hello!", "Goodbye!"]);
//
//  const app3 = compose()
//    .use((input, { useMeta }) => {
//      useMeta("Hello!");
//      return input;
//    })
//    .all([[/$.*.hi/], [/$.*.bye/]])
//    .use(
//      (i, { useMeta }) => useMeta(),
//      (i, { useMeta }) => useMeta()
//    );
//
//  expect(await app3([{ hi: "Hi!", bye: "Bye!" }])).toEqual([
//    "Hello!",
//    "Hello!"
//  ]);
//});
//
//it("should broadcast singular meta across multiple channels", async () => {
//  const getMeta = () => (_, { useMeta }) => useMeta();
//  const app = compose()
//    .use((_, { useMeta }) => {
//      useMeta("Hi?");
//      return null;
//    })
//    .use(getMeta(), getMeta());
//
//  expect(await app(undefined)).toEqual(["Hi?", "Hi?"]);
//
//  const initialMeta = () => ({ useGlobal }) => {
//    const { getState } = useGlobal();
//    const meta = getState().toJS();
//    return (input, { useMeta }) => {
//      useMeta(meta);
//      return input;
//    };
//  };
//
//  const app2 = compose(buildStore)
//    .all(pre(initialMeta()))
//    .use(getMeta(), getMeta());
//
//  const trainingResults = await app2(
//    "/home/cawfree/Development/mnist-dataset/public/train-images-idx3-ubyte.json",
//    "/home/cawfree/Development/mnist-dataset/public/train-labels-idx1-ubyte.json"
//  );
//
//  expect(trainingResults).toEqual([{ cnt: 0 }, { cnt: 0 }]);
//});
//
//it("should be possible to define a custom identifier generator", async () => {
//  // XXX: Prevent recursively appending functions.
//  let didAdd = false;
//
//  const someReceiver = (hooks, args) => {
//    const { useKey } = hooks;
//    if (!typeCheck("String", useKey())) {
//      throw new Error(
//        `Expected elevated key implementor, but encountered ${useKey()}.`
//      );
//    }
//    const [[[a, b], ...extras]] = args;
//    if (!didAdd && typeCheck("Function", a) && typeCheck("Function", b)) {
//      didAdd = true;
//      return [
//        [
//          [
//            pre(({ useGlobal, useKey }) => () => {
//              return useGlobal()
//                .getState()
//                .get("cnt");
//            }),
//            (b, { useKey }) => {
//              if (!typeCheck("Function", useKey())) {
//                throw new Error(
//                  `Expected Function useKey, but encountered ${useKey()}.`
//                );
//              }
//              return b;
//            }
//          ],
//          ...extras
//        ]
//      ];
//    }
//    return args;
//  };
//  const someCustomId = ({ useGlobal }, ...args) => "some-custom-id";
//  const someOtherId = () => "some-other-id";
//
//  const app = compose(buildStore, someReceiver, someCustomId).use(
//    compose().use(
//      compose(buildStore, someReceiver, someOtherId).use(
//        b => !b,
//        b => !b
//      )
//    )
//  );
//
//  expect(await app(true, false)).toEqual([0, false]);
//});
//
//it("should be possible to insert into an array of rippleware", async () => {
//  let didInsert = false;
//
//  const someReceiver = (hooks, args) => {
//    for (let i = 0; i < args.length; i += 1) {
//      const [actualArgs] = args[i];
//      if (!didInsert && actualArgs.length === 2) {
//        didInsert = true;
//        return [
//          ...args.slice(0, i),
//          ...args.slice(i),
//          [[e => "Hello!", e => "Hello!"], e => e, null]
//        ];
//      }
//    }
//    return args;
//  };
//
//  const app = compose(buildStore, someReceiver)
//    .use(e => e)
//    .use(e => e)
//    .use(e => e)
//    .use(
//      compose().use(
//        e => !e,
//        e => !e
//      )
//    );
//
//  expect(await app(true)).toEqual(["Hello!", "Hello!"]);
//});
//
//it("should permit conditional execution of a composable instance", async () => {
//  const app = compose().all([
//    ["String", compose().use(() => "It is a string!")],
//    ["*", () => "Not a string!"]
//  ]);
//
//  expect(await app("Hello!")).toEqual(["It is a string!"]);
//  expect(await app(0)).toEqual(["Not a string!"]);
//
//  const app2 = compose()
//    .use((_, { useMeta }) => {
//      useMeta(3);
//      return undefined;
//    })
//    .all([
//      [
//        "*",
//        compose().use((_, { useMeta }) => {
//          useMeta(useMeta() + 1);
//          return undefined;
//        })
//      ]
//    ])
//    .use((_, { useMeta }) => useMeta());
//
//  expect(await app2(undefined)).toEqual([4]);
//
//  const app3 = compose()
//    .use((_, { useMeta }) => {
//      useMeta([2, 1]);
//      return undefined;
//    })
//    .all([
//      [
//        "*",
//        compose().use((_, { useMeta }) => {
//          useMeta(useMeta());
//          return undefined;
//        })
//      ]
//    ])
//    .use((_, { useMeta }) => useMeta());
//
//  expect(await app3(undefined)).toEqual([[2, 1]]);
//});
//
//it("should be possible to retain state in between conditionally executed hooks", async () => {
//  const app = compose()
//    .use([
//      [
//        "Number",
//        (_, { useState }) => {
//          const [state] = useState(4);
//          if (state !== 4) {
//            throw new Error(`Expected 4, encountered ${state}.`);
//          }
//          return _;
//        }
//      ],
//      ["*", noop()]
//    ])
//    .use([
//      [
//        "String",
//        (_, { useState }) => {
//          const [state] = useState("hello");
//          if (state !== "hello") {
//            throw new Error(`Expected \"hello\", encountered ${state}.`);
//          }
//          return _;
//        }
//      ],
//      ["*", noop()]
//    ]);
//
//  // XXX: These cause the app to flip between branches of executed middleware.
//  //      We expect the states for these layers to be retained even though they're
//  //      skipped out of current execution. (There is no unmounting in rippleware).
//
//  await app(0);
//  await app("String");
//  await app(0);
//  await app("String");
//
//  expect(true).toBeTruthy();
//});
//
//it("should be possible to define the context of execution for a rippleware", async () => {
//  expect(() => compose().ctx()).toThrow();
//  expect(() => compose().ctx(1, 2)).toThrow();
//  expect(() => compose().ctx([1, 2])).toBeTruthy();
//  expect(() =>
//    compose()
//      .ctx([1, 2])
//      .ctx([1, 2])
//  ).toThrow();
//  expect(() =>
//    compose()
//      .use(noop())
//      .ctx([1, 2])
//  ).toThrow();
//
//  const app = compose().use((_, { useContext }) => useContext());
//
//  expect(await app(3)).toEqual([undefined]);
//
//  const app2 = compose()
//    .ctx("Context.")
//    .use((_, { useContext }) => useContext());
//
//  expect(await app2(3)).toEqual(["Context."]);
//
//  const app3 = compose()
//    .ctx("Nested context.")
//    .use(compose().use(compose().use((_, { useContext }) => useContext())));
//
//  expect(await app3(3)).toEqual(["Nested context."]);
//
//  const app4 = compose()
//    .ctx("Context A")
//    .use(
//      compose()
//        .ctx("Context B")
//        .use((_, { useContext }) => useContext())
//    );
//
//  expect(await app4(undefined)).toEqual(["Context B"]);
//
//  const app5 = compose()
//    .ctx("Context A")
//    .use(
//      compose()
//        .ctx("Context B")
//        .use(noop())
//    )
//    .use((_, { useContext }) => useContext());
//
//  expect(await app5(undefined)).toEqual(["Context A"]);
//
//  const app6 = compose(buildStore)
//    .ctx(({ useGlobal }) =>
//      useGlobal()
//        .getState()
//        .get("cnt")
//    )
//    .use((_, { useContext }) => useContext());
//
//  expect(await app6(undefined)).toEqual([0]);
//
//  const app7 = compose(buildStore)
//    .ctx(({ useGlobal }) =>
//      useGlobal()
//        .getState()
//        .get("cnt")
//    )
//    .use(compose().use((_, { useContext }) => useContext()));
//
//  expect(await app7(undefined)).toEqual([0]);
//
//  const app8 = compose(buildStore)
//    .ctx(({ useGlobal }) =>
//      useGlobal()
//        .getState()
//        .get("cnt")
//    )
//    .use(
//      compose()
//        .ctx(() => "hello")
//        .use(noop())
//    )
//    .use((_, { useContext }) => useContext());
//
//  expect(await app8(undefined)).toEqual([0]);
//});
//
//it("should be capable of broadcasting input data across conditionals", async () => {
//  const app = compose()
//    .all(
//      compose().use([
//        [
//          "String",
//          compose().all(
//            e => {
//              return e;
//            },
//            e => e
//          )
//        ]
//      ])
//    );
//  expect(await app("hi")).toEqual(["hi", "hi"]);
//});
//
//it("should be possible to inspect state from a matcher function", async () => {
//  const app = compose(buildStore)
//    .use([
//      [
//        (_, { useGlobal }) =>
//          useGlobal()
//            .getState()
//            .get("cnt") === 0,
//        e => true
//      ],
//      ["*", noop()]
//    ])
//    .use((_, { useGlobal }) => {
//      const { dispatch } = useGlobal();
//      dispatch(increment());
//      return _;
//    });
//
//  expect(await app(3)).toEqual([true]);
//  expect(await app(3)).toEqual([3]);
//});
//
//it("should be possible to execute middleware against a matcher function", async () => {
//  const app = compose().all([[() => true, compose().use(b => !b)]]);
//  expect(await app(false)).toEqual([true]);
//});
//
//it("should be possible to propagate channel information from nested rippleware", async () => {
//  const app = compose().use([
//    ["String", e => "String!"],
//    ["*", () => "Not String!"]
//  ]);
//
//  expect(await app("hi")).toEqual(["String!"]);
//  expect(await app(0)).toEqual(["Not String!"]);
//
//  const app2 = compose()
//    .use(
//      compose().all(
//        e => e,
//        e => e
//      )
//    )
//    .use(
//      e => e + 1,
//      e => e + 1
//    );
//
//  expect(await app2(5)).toEqual([6, 6]);
//
//  const app3 = compose().all([
//    [
//      "String",
//      compose().all(
//        e => e,
//        e => e
//      )
//    ]
//  ]);
//
//  expect(await app3("Hi!")).toEqual(["Hi!", "Hi!"]);
//
//  const app4 = compose()
//    .all(
//      compose().use(
//        compose().all(
//          e => e,
//          e => e
//        )
//      )
//    )
//    .use(
//      e => e + 1,
//      e => e + 1
//    );
//
//  expect(await app4(5)).toEqual([6, 6]);
//
//  const app5 = compose().use([["String", () => [1, 2]]]);
//
//  expect(await app5("Hi!")).toEqual([[1, 2]]);
//});
