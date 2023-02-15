export enum ConfettiSvg {
  DIAMOND = "diamond",
  BOMB = "bomb",
  ROCKET = "rocket",
  COMET = "comet",
  LAMBO = "lambo",
}

const svgToProps = {
  [ConfettiSvg.DIAMOND]: { size: 10, weight: 1 },
  [ConfettiSvg.ROCKET]: { size: 18, weight: 1 },
  [ConfettiSvg.BOMB]: { size: 18, weight: 1 },
  [ConfettiSvg.COMET]: { size: 18, weight: 1 },
  [ConfettiSvg.LAMBO]: { size: 18, weight: 1 },
};
import ConfettiGenerator from "confetti-js";

export const celebrate = (svgList: ConfettiSvg[] = []) => {
  const canvasID = "confetti-canvas";
  const confettiSettings: any = {
    target: canvasID,
    max: 500,
    respawn: false,
    size: 2,
    start_from_edge: true,
    rotate: true,
    clock: 100,
    // props: [] as any[],
  };
  if (svgList.length > 0) {
    confettiSettings["props"] = svgList.map((svg) => {
      return { ...{ type: "svg", src: `/assets/${svg}.svg` }, ...svgToProps[svg] };
    });
    if (svgList.indexOf(ConfettiSvg.DIAMOND) >= 0) {
      confettiSettings.clock = 150;
    } else {
      confettiSettings.clock = 75;
    }
    confettiSettings.max = 200;
  }
  const confetti = new ConfettiGenerator(confettiSettings);
  confetti.render();
};
