import { Deso } from "deso-protocol";

export const desoAPI = new Deso({
  nodeUri: process.env.REACT_APP_API_URL,
});
