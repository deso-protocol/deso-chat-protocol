import { AppUser, UserContext, UserContextType } from "contexts/UserContext";
import {
  AccessGroupEntryResponse,
  configure,
  createAccessGroup,
  getAllAccessGroups,
  getUsersStateless,
  identity,
  NOTIFICATION_EVENTS,
  User,
} from "deso-protocol";
import { uniqBy } from "lodash";
import * as process from "process";
import { useEffect, useState } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Header } from "./components/header";
import { MessagingApp } from "./components/messaging-app";
import { RefreshContext } from "./contexts/RefreshContext";
import {
  DEFAULT_KEY_MESSAGING_GROUP_NAME,
  DESO_NETWORK,
  getTransactionSpendingLimits,
} from "./utils/constants";

configure({
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
    setAllAccessGroups: (newAllAccessGroups: AccessGroupEntryResponse[]) => {
      setUserState((state) => {
        if (!state.appUser) {
          throw new Error("cannot set access groups without a logged in user!");
        }

        const allAccessGroups = uniqBy(
          state.allAccessGroups.concat(newAllAccessGroups),
          (group) => {
            return (
              group.AccessGroupOwnerPublicKeyBase58Check +
              group.AccessGroupKeyName
            );
          }
        );

        return {
          ...state,
          allAccessGroups,
        };
      });
    },
    allAccessGroups: [],
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
            getUser(currentUser.publicKey),
            getAllAccessGroups({
              PublicKeyBase58Check: currentUser.publicKey,
            }),
          ])
            .then(([userRes, { AccessGroupsOwned, AccessGroupsMember }]) => {
              // if the user doesn't have a default group, they are not set up for messaging yet.
              // we'll do that automatically for them.
              if (
                !AccessGroupsOwned?.find(
                  ({ AccessGroupKeyName }) =>
                    AccessGroupKeyName === DEFAULT_KEY_MESSAGING_GROUP_NAME
                )
              ) {
                return createAccessGroup({
                  AccessGroupOwnerPublicKeyBase58Check: currentUser.publicKey,
                  AccessGroupPublicKeyBase58Check:
                    messagingPublicKeyBase58Check,
                  AccessGroupKeyName: DEFAULT_KEY_MESSAGING_GROUP_NAME,
                  MinFeeRateNanosPerKB: 1000,
                }).then(() => {
                  // QUESTION: do we need to wait for the create tx to show up on
                  // the node before calling to retrieve the access groups? This
                  // has been live for a bit and seems fine...
                  return getAllAccessGroups({
                    PublicKeyBase58Check: currentUser.publicKey,
                  }).then((groups) => {
                    const user: User | null = userRes.UserList?.[0] ?? null;
                    const appUser: AppUser | null = user && {
                      ...user,
                      messagingPublicKeyBase58Check,
                      accessGroupsOwned: groups.AccessGroupsOwned,
                    };
                    const allAccessGroups = (AccessGroupsOwned || []).concat(
                      AccessGroupsMember || []
                    );

                    setUserState((state) => ({
                      ...state,
                      appUser,
                      allAccessGroups,
                    }));

                    return user;
                  });
                });
              } else {
                const user: User | null = userRes.UserList?.[0] ?? null;
                const appUser: AppUser | null = user && {
                  ...user,
                  messagingPublicKeyBase58Check,
                  accessGroupsOwned: AccessGroupsOwned,
                };
                const allAccessGroups = (AccessGroupsOwned || []).concat(
                  AccessGroupsMember || []
                );

                setUserState((state) => ({
                  ...state,
                  appUser,
                  allAccessGroups,
                }));

                return user;
              }
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
                  getUser(currentUser.publicKey).then((res) => {
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

          <section className="h-[calc(100%-64px)] mt-[64px] overflow-scroll">
            <MessagingApp />
          </section>

          <ToastContainer />
        </div>
      </RefreshContext.Provider>
    </UserContext.Provider>
  );
}

const getUser = async (publicKey: string) =>
  getUsersStateless({
    PublicKeysBase58Check: [publicKey],
    SkipForLeaderboard: true,
    IncludeBalance: true,
    GetUnminedBalance: true,
  });

export default App;
