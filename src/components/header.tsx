import {
  Menu,
  MenuHandler,
  MenuItem,
  MenuList,
} from "@material-tailwind/react";
import { UserContext } from "contexts/UserContext";
import { identity } from "deso-protocol";
import { useContext } from "react";
import {
  IoCopy,
  IoCopyOutline,
  IoExitOutline,
  IoHappyOutline,
  IoLogoGithub,
  IoPersonOutline,
  IoWalletOutline,
} from "react-icons/io5";
import { toast } from "react-toastify";
import { RefreshContext } from "../contexts/RefreshContext";
import { formatDisplayName, getProfileURL } from "../utils/helpers";
import { MessagingDisplayAvatar } from "./messaging-display-avatar";
import { SaveToClipboard } from "./shared/save-to-clipboard";
import { UserAccountList } from "./user-account-list";

export const Header = () => {
  const { appUser } = useContext(UserContext);
  const { setLockRefresh } = useContext(RefreshContext);

  return (
    <header className="flex justify-between py-3 px-4 h-[64px] fixed top-0 z-50 w-full">
      <a href="/" className="flex items-center">
        <div className="text-left flex items-center">
          <img src="/assets/logo-white.svg" width={100} alt="deso-logo" />
          <span className="text-blue-300/60 ml-3 text-sm md:text-base">
            Chat Protocol
          </span>
        </div>
      </a>

      <div className="flex items-center">
        <div className="flex items-center ml-2">
          {appUser && (
            <div className="flex flex-col items-end pr-1 md:pr-2">
              <div className="mb-0 text-blue-100 text-sm">
                <span className="font-semibold">
                  {formatDisplayName(appUser)}
                </span>
              </div>
              <a
                className="block text-blue-200/80 text-sm"
                href={"https://wallet.deso.com/?user=" + formatDisplayName(appUser)}
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
                  classNames="ml-1 md:ml-3"
                />
              </div>
            </MenuHandler>

            <MenuList className="max-w-[230px] w-[230px] p-2">
              <div>
                <div className="px-2 pt-1 pb-2 flex justify-between text-black items-center border-b">
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
                      <IoHappyOutline className="mr-3 text-xl" />
                      <span className="text-base">My profile</span>
                    </div>
                  </a>
                </MenuItem>
              )}
              {appUser && (
                <MenuItem className="flex items-center pt-[9px] pb-2 text-black px-3">
                  <SaveToClipboard
                    text={appUser.PublicKeyBase58Check}
                    copyIcon={<IoCopyOutline className="text-xl mr-2" />}
                    copiedIcon={<IoCopy className="text-xl mr-2" />}
                    className=""
                  >
                    <span className="text-base">Copy Public Key</span>
                  </SaveToClipboard>
                </MenuItem>
              )}
               <MenuItem className="flex items-center p-0">
                <a
                  href="https://wallet.deso.com"
                  target="_blank"
                  rel="noreferrer"
                  className="w-full outline-0 text-black"
                >
                  <div className="w-full flex items-center pt-[9px] pb-2 px-3">
                    <IoWalletOutline className="mr-3 text-xl" />
                    <span className="text-base">DeSo Wallet</span>
                  </div>
                  
                </a>
              </MenuItem>
              <MenuItem className="flex items-center p-0">
                <a
                  href="https://github.com/deso-protocol/deso-chat-protocol"
                  target="_blank"
                  rel="noreferrer"
                  className="w-full outline-0 text-black"
                >
                  <div className="w-full flex items-center pt-[9px] pb-2 px-3">
                    <IoLogoGithub className="mr-3 text-xl" />
                    <span className="text-base">Fork This Project</span>
                  </div>
                  
                </a>
              </MenuItem>
              <MenuItem
                className="flex items-center text-black"
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
                <IoExitOutline className="mr-3 text-xl" />
                <span className="text-base">Logout</span>
              </MenuItem>
            </MenuList>
          </Menu>
        </div>
      </div>
    </header>
  );
};
