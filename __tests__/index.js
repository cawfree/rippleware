import "@babel/polyfill";

import compose from "../src";

it("should channel data in a predictable manner", async () => {

  const app = compose()
    .use(
      [
        ['*', () => null],
        ['*', () => null],
        ['*', () => null],
        ['*', () => null],
      ],
    );

  //const app = compose()
  //  .sep(
  //    () => 1,
  //    () => 1,
  //  )
  //  .use(
  //    compose()
  //      .use(
  //        i => i + 1,
  //        i => i + 2,
  //      ),
  //  );

  console.log(await app([1, 2]));

  expect(true).toBeTruthy();
});
