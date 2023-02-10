import { MOBILE_WIDTH_BREAKPOINT } from "../utils/constants";
import { useEffect, useState } from "react";

export function useMobile() {
  const [width, setWidth] = useState<number>(window.innerWidth);

  function handleWindowSizeChange() {
    setWidth(window.innerWidth);
  }

  useEffect(() => {
    window.addEventListener("resize", handleWindowSizeChange);
    return () => {
      window.removeEventListener("resize", handleWindowSizeChange);
    };
  }, []);

  return {
    isMobile: width <= MOBILE_WIDTH_BREAKPOINT,
  };
}
