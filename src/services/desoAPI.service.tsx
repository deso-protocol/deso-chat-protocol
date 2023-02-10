import { Deso } from "deso-protocol";
import { DESO_NETWORK } from "utils/constants";

export const desoAPI = new Deso({
  nodeUri: process.env.REACT_APP_NODE_URL + "/api/v0",
  identityConfig: {
    uri: process.env.REACT_APP_IDENTITY_URL,
    network: DESO_NETWORK,
    skipIdentityEmbed: true,
  },
});
