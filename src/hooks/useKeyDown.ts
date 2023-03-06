import { useEffect } from "react";

type CallbackFunction = (event: KeyboardEvent) => void;

function useKeyDown(callback: CallbackFunction, keys: Array<string>) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const wasAnyKeyPressed = keys.some((key) => event.key === key);
      if (wasAnyKeyPressed) {
        event.preventDefault();

        if (callback && typeof callback === "function") {
          callback(event);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [callback]);
}

export default useKeyDown;
