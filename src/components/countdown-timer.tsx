import { useContext, useEffect, useState } from "react";
import { useInterval } from "../hooks/useInterval";
import { celebrate, ConfettiSvg } from "../services/confetti.service";
import { UserContext } from "../contexts/UserContext";

export const CountdownTimer = () => {
  const { appUser } = useContext(UserContext);

  const [seconds, setSeconds] = useState<number>(5);

  useEffect(() => {
    setSeconds(5);
  }, [appUser?.PublicKeyBase58Check]);

  useInterval(() => {
    setSeconds(seconds - 1);
    if (seconds === 0) {
      celebrate([ConfettiSvg.DIAMOND, ConfettiSvg.ROCKET]);
    }
  }, 1000);

  return seconds >= 0 ? (
    <div className="h-full w-full z-100 relative bg-black justify-center items-center flex">
      <div>
        <strong className="text-9xl text-red-500">
          <span className="border border-red-500 p-4">00</span>
          <span className="p-4">:</span>
          <span className="border border-red-500 p-4">00</span>
          <span className="p-4">:</span>
          <span className="border border-red-500 p-4">0{seconds}</span>
        </strong>
      </div>
    </div>
  ) : (
    <></>
  );
};
