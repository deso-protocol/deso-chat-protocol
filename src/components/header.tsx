import { identity } from "@deso-core/identity";
import {
  Menu,
  MenuHandler,
  MenuItem,
  MenuList,
} from "@material-tailwind/react";
import { UserContext } from "contexts/UserContext";
import { useContext } from "react";
import { formatDisplayName, getProfileURL } from "../utils/helpers";
import { MessagingDisplayAvatar } from "./messaging-display-avatar";
import { SaveToClipboard } from "./shared/save-to-clipboard";
import { RefreshContext } from "../contexts/RefreshContext";
import { UserAccountList } from "./user-account-list";
import { toast } from "react-toastify";

export const Header = () => {
  const { appUser } = useContext(UserContext);
  const { setLockRefresh } = useContext(RefreshContext);

  return (
    <header className="flex justify-between px-4 fixed top-0 z-50 bg-black/40 w-full backdrop-blur-md h-[80px]">
      <a href="/" className="flex items-center">
        <div className="text-left">
          <img src="/assets/logo-white.svg" width={100} alt="deso-logo" />
        </div>
      </a>

      <div className="flex items-center">
        <div className="flex items-center ml-2">
          {appUser && (
            <div className="flex flex-col items-end pr-2">
              <div className="mb-1 text-blue-100 text-sm">
                Hi,{" "}
                <span className="font-semibold">
                  {formatDisplayName(appUser)}
                </span>
              </div>
              <a
                className="block text-blue-200/80 text-sm"
                href="https://signup.deso.com/wallet"
                target="_blank"
                rel="noreferrer"
              >
                View Wallet
              </a>
            </div>
          )}

          <Menu placement="bottom-end">
            <MenuHandler>
              <div className="cursor-pointer">
                <MessagingDisplayAvatar
                  publicKey={appUser?.PublicKeyBase58Check}
                  diameter={35}
                  classNames="ml-3"
                />
              </div>
            </MenuHandler>

            <MenuList className="max-w-[230px] w-[230px] p-2">
              <div>
                <div className="block px-2 pt-1 pb-2 flex justify-between items-center border-b">
                  <span className="font-bold text-lg md:text-base">
                    Profiles
                  </span>

                  <button
                    className="bg-transparent hover:bg-blue-500 text-blue-700 font-semibold md:text-sm hover:text-white border py-1 px-2 border-blue-500 hover:border-transparent rounded outline-none"
                    onClick={async () => {
                      setLockRefresh(true);

                      try {
                        await identity.login();
                      } catch (e) {
                        toast.error(`Error logging in: ${e}`);
                        console.error(e);
                      }
                      setLockRefresh(false);
                    }}
                  >
                    Add
                  </button>
                </div>

                <UserAccountList />
              </div>

              {appUser?.ProfileEntryResponse && (
                <MenuItem className="flex items-center p-0">
                  <a
                    href={getProfileURL(appUser.ProfileEntryResponse.Username)}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full outline-0"
                  >
                    <div className="w-full flex items-center pt-[9px] pb-2 px-3">
                      <img
                        src="/assets/external-link.png"
                        width={20}
                        className="mr-2"
                        alt="external-link"
                      />

                      <span className="text-base">My Profile</span>
                    </div>
                  </a>
                </MenuItem>
              )}

              {appUser && (
                <MenuItem className="flex items-center p-0">
                  <SaveToClipboard
                    text={appUser.PublicKeyBase58Check}
                    copyIcon={
                      <img
                        src="/assets/copy.png"
                        className="invert"
                        width={20}
                        alt="copy-to-clipboard"
                      />
                    }
                    copiedIcon={
                      <img
                        src="/assets/copy-filled.png"
                        className="invert"
                        width={20}
                        alt="copied-to-clipboard"
                      />
                    }
                    className="w-full pt-[9px] pb-2 px-3"
                  >
                    <span className="text-base">Copy public key</span>
                  </SaveToClipboard>
                </MenuItem>
              )}

              {!appUser && (
                <MenuItem className="flex items-center p-0">
                  <a
                    href="https://deso.com"
                    target="_blank"
                    rel="noreferrer"
                    className="w-full outline-0"
                  >
                    <div className="w-full flex items-center pt-[9px] pb-2 px-3">
                      <img
                        src="/assets/external-link.png"
                        width={20}
                        className="mr-2"
                        alt="logout"
                      />

                      <span className="text-base">Go to deso.com</span>
                    </div>
                  </a>
                </MenuItem>
              )}

              <MenuItem
                className="flex items-center"
                onClick={async () => {
                  if (!appUser) return;

                  setLockRefresh(true);

                  try {
                    await identity.logout();
                  } catch (e) {
                    toast.error(`Error logging out: ${e}`);
                    console.error(e);
                  }
                  setLockRefresh(false);
                }}
              >
                <img
                  src="/assets/logout.png"
                  width={20}
                  className="mr-2"
                  alt="logout"
                />

                <span className="text-base">Logout</span>
              </MenuItem>
            </MenuList>
          </Menu>
        </div>
      </div>
    </header>
  );
};
