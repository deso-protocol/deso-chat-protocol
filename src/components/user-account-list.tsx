import { User } from "deso-protocol-types";
import { useContext, useEffect, useState } from "react";
import orderBy from "lodash/orderBy";
import { MessagingDisplayAvatar } from "./messaging-display-avatar";
import { formatDisplayName } from "../utils/helpers";
import { UserContext } from "../contexts/UserContext";
import { identity } from "@deso-core/identity";
import { desoAPI } from "../services/desoAPI.service";
import { ClipLoader } from "react-spinners";

const COLLAPSED_ACCOUNTS_NUM = 3;
const EXPANDED_ACCOUNTS_NUM = 10;
const ACCOUNT_LIST_ITEM_HEIGHT_PX = 40;

type Account = {
  name: string;
  onclick: (key: string) => void;
  key: string;
  profile: User;
  hasProfile: boolean;
  isActive: boolean;
}

const UserAccountList = () => {
  const { appUser } = useContext(UserContext);
  const [showMore, setShowMore] = useState<boolean>(false);
  const [users, setUsers] = useState<User[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: undecided about whether to show loader or show public keys before
    // we've fetched data from backend. For now, show loader.
    setLoading(true);
    const snapshot = identity.snapshot();
    const activeUser = snapshot.currentUser;
    const alternateUsers = Object.keys(snapshot.alternateUsers || {});

    const PublicKeysBase58Check = [...(activeUser ? [activeUser.publicKey] : []), ...alternateUsers];
    setUsers(PublicKeysBase58Check.map((key) => ({ PublicKeyBase58Check: key })) as User[]);
    desoAPI.user.getUsersStateless({
      PublicKeysBase58Check,
      SkipForLeaderboard: true,
    }).then((res) => {
      if (res.UserList) {
        setUsers(res.UserList);
      }
    }).finally(() => setLoading(false));
  }, [appUser]);

  useEffect(() => {
    const accounts = (users || []).map((user) => {
      const key = user.PublicKeyBase58Check;
      const isActive = key === appUser?.PublicKeyBase58Check;
      const profile =
        isActive && appUser ? appUser : user;
      const hasProfile = !!profile;

      return {
        name: formatDisplayName(user),
        onclick: async (key: string) => identity.setActiveUser(key),
        key,
        profile,
        hasProfile,
        isActive,
      };
    });
    const sortedAccounts = orderBy(
      accounts,
      ["isActive", "hasProfile", "name"],
      ["desc", "desc", "asc"]
    );
    setAllAccounts(sortedAccounts);
  }, [users]);

  const visibleAccounts = showMore
    ? allAccounts
    : allAccounts.slice(0, COLLAPSED_ACCOUNTS_NUM);

  return (
    <div className="mb-0">
      {
        loading ?
          <div className="flex justify-center">
            <ClipLoader color={"#6d4800"} loading={true} size={16} />
          </div> :
          <>
            <ul
              className="text-gray-700 custom-scrollbar"
              aria-labelledby="dropdownInformationButton"
              style={
                showMore
                  ? {
                      maxHeight: `${
                        EXPANDED_ACCOUNTS_NUM * ACCOUNT_LIST_ITEM_HEIGHT_PX
                      }px`,
                      overflowY: "scroll",
                    }
                  : {}
              }
            >
              {visibleAccounts.map((option) => {
                return (
                  <li
                    key={option.key}
                    onClick={() => option.onclick(option.key)}
                    className="cursor-pointer text-md"
                    style={{ height: `${ACCOUNT_LIST_ITEM_HEIGHT_PX}px` }}
                  >
                    <div
                      className={`flex items-center py-1 hover:bg-gray-100 ${
                        option.isActive ? "font-bold" : ""
                      }`}
                    >
                      <MessagingDisplayAvatar
                        publicKey={option.key}
                        username={option.name}
                        classNames="mr-2 ml-0"
                        diameter={28}
                      />
                      <div className="truncate">{option.name}</div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {!showMore && allAccounts.length > COLLAPSED_ACCOUNTS_NUM && (
              <span
                className="text-blue-600 text-sm text-left mx-4 my-2 block cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMore(true);
                }}
              >
                Show more
              </span>
            )}
          </>
      }
    </div>
  );
};

export { UserAccountList };
