import compose from "./compose";

export default (...args) => burden =>
  burden("*", (input, { useState }) => {
    const [app] = useState(() => compose().use(...args));
    const [once, setOnce] = useState(false);

    if (once === false) {
      setOnce(true);
      return app(input);
    }
    return input;
  });
