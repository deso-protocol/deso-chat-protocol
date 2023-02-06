import React, { useState } from 'react';
import { MessagingApp } from "./components/messaging-app";
import Deso from "deso-protocol";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Header } from "./components/header";
import { DesoContext } from "./contexts/desoContext";
import * as process from "process";
import { DESO_NETWORK } from "./utils/constants";

function App() {
  const deso = new Deso({
    nodeUri: process.env.REACT_APP_API_URL,
    identityConfig: {
      uri: process.env.REACT_APP_IDENTITY_URL,
      network: DESO_NETWORK,
      skipIdentityEmbed: true,
    },
  });
  const [hasSetupAccount, setHasSetupAccount] = useState(false);
  const [loggedInPublicKey, setLoggedInPublicKey] = useState("");
  const [lockRefresh, setLockRefresh] = useState(false);

  return (
    <DesoContext.Provider
      value={{
        deso,
        hasSetupAccount,
        setHasSetupAccount,
        loggedInPublicKey,
        setLoggedInPublicKey,
        lockRefresh,
        setLockRefresh
      }}
    >
      <div className="App">
        <Header />

        <section className="h-[calc(100%-80px)] mt-[80px]">
          <MessagingApp />
        </section>

        <ToastContainer />
      </div>
    </DesoContext.Provider>
  );
}

export default App;
