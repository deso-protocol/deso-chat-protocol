import { identity, NOTIFICATION_EVENTS } from "@deso-core/identity";
import { AppUser, UserContext, UserContextType } from "contexts/UserContext";
import { AccessGroupEntryResponse } from "deso-protocol-types";
import * as process from "process";
import { RefreshContext } from "./contexts/RefreshContext";
import { useEffect, useState } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Header } from "./components/header";
import { MessagingApp } from "./components/messaging-app";
import { desoAPI } from "./services/desoAPI.service";
import { DESO_NETWORK, getTransactionSpendingLimits } from "./utils/constants";

identity.configure({
  identityURI: process.env.REACT_APP_IDENTITY_URL,
  nodeURI: process.env.REACT_APP_NODE_URL,
  network: DESO_NETWORK,
  spendingLimitOptions: getTransactionSpendingLimits(""),
});

function App() {
  const [userState, setUserState] = useState<UserContextType>({
    appUser: null,
    isLoadingUser: true,
    setAccessGroups: (accessGroupsOwned: AccessGroupEntryResponse[]) =>
      setUserState((state) => {
        if (!state.appUser) {
          throw new Error("cannot set access groups without a logged in user!");
        }
        const currAppUser = state.appUser;
        return { ...state, appUser: { ...currAppUser, accessGroupsOwned } };
      }),
  });
  const [lockRefresh, setLockRefresh] = useState(false);

  useEffect(
    () => {
      // if the user doesn't have a balance we'll kick off a polling interval to check for it
      // probably we can just delete this since we changed the identity thing to just force you to get $DESO.
      // I guess we can leave it here for now, although it just adds unnecessary complexity imo.
      let pollingIntervalId = 0;

      identity.subscribe(({ event, currentUser, alternateUsers }) => {
        if (!currentUser && !alternateUsers) {
          setUserState((state) => ({
            ...state,
            appUser: null,
            isLoadingUser: false,
          }));
          return;
        }

        if (
          event === NOTIFICATION_EVENTS.AUTHORIZE_DERIVED_KEY_START &&
          currentUser
        ) {
          setUserState((state) => ({ ...state, isLoadingUser: true }));
          return;
        }

        if (
          currentUser &&
          currentUser?.publicKey !== userState.appUser?.PublicKeyBase58Check &&
          [
            NOTIFICATION_EVENTS.SUBSCRIBE,
            NOTIFICATION_EVENTS.LOGIN_END,
            NOTIFICATION_EVENTS.CHANGE_ACTIVE_USER,
          ].includes(event)
        ) {
          const { messagingPublicKeyBase58Check } =
            currentUser.primaryDerivedKey;

          setUserState((state) => ({ ...state, isLoadingUser: true }));
          Promise.all([
            fetchAppUserData(currentUser.publicKey),
            desoAPI.accessGroup.GetAllUserAccessGroups({
              PublicKeyBase58Check: currentUser.publicKey,
            }),
          ])
            .then(([userRes, { AccessGroupsOwned }]) => {
              const user = userRes.UserList?.[0] ?? null;
              const appUser: AppUser | null = user && {
                ...user,
                messagingPublicKeyBase58Check,
                accessGroupsOwned: AccessGroupsOwned,
              };

              setUserState((state) => ({
                ...state,
                appUser,
              }));

              return user;
            })
            .then((user) => {
              if (!user) return;
              // if the user doesn't have a balance, we'll poll for it in the
              // background every 3 seconds. The app will re-render wherever we
              // check the current user's balance once we see a non-zero value.
              // we'll clear any previous interval first in case the user changes
              // accounts.
              window.clearInterval(pollingIntervalId);
              if (user.BalanceNanos === 0) {
                pollingIntervalId = window.setInterval(async () => {
                  fetchAppUserData(currentUser.publicKey).then((res) => {
                    const user = res.UserList?.[0];
                    if (user && user.BalanceNanos > 0) {
                      setUserState((state) => ({
                        ...state,
                        appUser: {
                          ...user,
                          messagingPublicKeyBase58Check,
                        },
                      }));
                      window.clearInterval(pollingIntervalId);
                    }
                  });
                }, 3000);
              }
            })
            .finally(() => {
              setUserState((state) => ({ ...state, isLoadingUser: false }));
            });
          return;
        }

        if (event === NOTIFICATION_EVENTS.LOGOUT_END) {
          if (alternateUsers) {
            const fallbackUser = Object.values(alternateUsers)[0];
            identity.setActiveUser(fallbackUser.publicKey);
            return;
          }
          return;
        }
      });
    },
    [
      /*
        NOTE: it is very important that we DO NOT add dependencies here. We only want this to run ONCE
        https://reactjs.org/docs/hooks-effect.html (see the Note section at the bottom of the page)
      */
    ]
  );

  return (
    <UserContext.Provider value={userState}>
      <RefreshContext.Provider value={{ lockRefresh, setLockRefresh }}>
        <div className="App">
          <Header />

          <section className="h-[calc(100%-80px)] mt-[80px] md:h-calc(100%-60px) md:mt-[60px]">
            <MessagingApp />
          </section>

          <ToastContainer />
        </div>
      </RefreshContext.Provider>
    </UserContext.Provider>
  );
}

const fetchAppUserData = async (publicKey: string) =>
  desoAPI.user.getUserStateless({
    PublicKeysBase58Check: [publicKey],
    SkipForLeaderboard: true,
    IncludeBalance: true,
    GetUnminedBalance: true,
  });

export default App;
