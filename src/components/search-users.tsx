import { Combobox } from "@headlessui/react";
import { ProfileEntryResponse } from "deso-protocol-types";
import { ethers } from "ethers";
import debounce from "lodash/debounce";
import { Fragment, useEffect, useState } from "react";
import ClipLoader from "react-spinners/ClipLoader";
import { toast } from "react-toastify";
import { desoAPI } from "../services/deso.service";
import { DESO_NETWORK } from "../utils/constants";
import {
  isMaybeDeSoPublicKey,
  isMaybeENSName,
  isMaybeETHAddress,
} from "../utils/helpers";
import { MessagingDisplayAvatar } from "./messaging-display-avatar";

export const shortenLongWord = (
  key: string | null,
  endFirstPartAfter = 6,
  startSecondPartAfter = 6,
  separator = "..."
) => {
  if (!key || key.length <= endFirstPartAfter + startSecondPartAfter) {
    return key || "";
  }

  return [
    key.slice(0, endFirstPartAfter),
    separator,
    key.slice(-startSecondPartAfter),
  ].join("");
};
export const nameOrFormattedKey = (
  profile: ProfileEntryResponse | null,
  key: string
) => {
  return profile?.Username || shortenLongWord(key, 6, 6);
};

export interface SearchMenuItem {
  id: string;
  profile: ProfileEntryResponse | undefined;
  text: string;
}

interface SearchUsersProps {
  placeholder?: string;
  hasPersistentDisplayValue?: boolean;
  initialValue?: string;
  onSelected: (item: SearchMenuItem | null) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onTyping?: any;
  className?: string;
}

export const SearchUsers = ({
  placeholder = "Search for users",
  hasPersistentDisplayValue = false,
  initialValue = "",
  onSelected,
  onFocus,
  onBlur,
  onTyping,
  className = "",
}: SearchUsersProps) => {
  const [menuItems, setMenuItems] = useState<SearchMenuItem[]>();
  const [inputValue, setInputValue] = useState(initialValue);
  const [loading, setLoading] = useState(false);
  const provider = new ethers.providers.InfuraProvider("homestead"); //, process.env.REACT_APP_INFURA_API_KEY);

  useEffect(() => {
    setInputValue(initialValue);
  }, [initialValue]);

  const searchForPublicKey = async (
    publicKey: string
  ): Promise<SearchMenuItem> => {
    const res = await desoAPI.user.getSingleProfile({
      PublicKeyBase58Check: publicKey,
      NoErrorOnMissing: true,
    });
    const item = {
      id: publicKey,
      profile: res.Profile ?? undefined,
      text: nameOrFormattedKey(res.Profile, publicKey),
    };
    await onSelected(item);
    setInputValue("");
    setMenuItems([]);
    return item;
  };

  const recoverETHAddress = async (ethAddress: string): Promise<string> => {
    const network = DESO_NETWORK;
    // If it barks like an ETH address, give it a shot.
    let desoPublicKey: string;
    try {
      // We try to recover from mainnet first.
      desoPublicKey = await desoAPI.ethereum.ethAddressToDeSoPublicKey(
        ethAddress,
        network,
        "homestead"
      );
    } catch (e) {
      try {
        // If it fails on mainnet, we try goerli
        desoPublicKey = await desoAPI.ethereum.ethAddressToDeSoPublicKey(
          ethAddress,
          network,
          "goerli"
        );
      } catch (err) {
        return Promise.reject(
          `unable to recover DeSo public key from ETH address ${ethAddress}`
        );
      }
    }
    return desoPublicKey;
  };

  const getProfiles = async (query: string) => {
    // TODO: find way to not pound infura API.
    if (isMaybeENSName(query)) {
      const ethAddress = await provider.resolveName(query);
      if (!ethAddress) {
        return Promise.reject(`unable to resolve ENS name ${query}`);
      }
      const desoPublicKey = await recoverETHAddress(ethAddress);
      await searchForPublicKey(desoPublicKey);
      return;
    } else if (isMaybeETHAddress(query)) {
      const desoPublicKey = await recoverETHAddress(query);
      await searchForPublicKey(desoPublicKey);
      return;
    } else if (isMaybeDeSoPublicKey(query)) {
      await searchForPublicKey(query);
      return;
    }
    const res = await desoAPI.user.getProfiles({
      PublicKeyBase58Check: "",
      Username: "",
      UsernamePrefix: query,
      Description: "",
      OrderBy: "",
      NumToFetch: 7,
      ReaderPublicKeyBase58Check: desoAPI.identity.getUserKey() ?? "",
      ModerationType: "",
      FetchUsersThatHODL: false,
      AddGlobalFeedBool: false,
    });

    setMenuItems(
      (res.ProfilesFound || []).map((p) => ({
        id: p.PublicKeyBase58Check,
        profile: p,
        text: nameOrFormattedKey(p, p.PublicKeyBase58Check),
      }))
    );
  };

  const getProfilesDebounced = debounce(async (q: string) => {
    setLoading(true);
    await getProfiles(q)
      .catch((e) => {
        console.error(e);
        toast.error(e);
      })
      .finally(() => setLoading(false));
  }, 500);
  const shownItems = menuItems || [];

  return (
    <div className="relative">
      <Combobox
        nullable={true}
        value={inputValue}
        onChange={(value) => {
          if (!value) {
            setInputValue("");
            onSelected(null);
            return;
          }

          const menuItem = shownItems.find(({ id }) => id === value);

          if (!menuItem) {
            return;
          }

          if (hasPersistentDisplayValue) {
            setInputValue(menuItem.id);
          }
          onSelected(menuItem);
        }}
      >
        <div className="relative">
          <Combobox.Input
            placeholder={placeholder}
            spellCheck={false}
            className={`w-full ring:border-blue-600 rounded-md ${className} text-blue-100 bg-blue-900/20`}
            onChange={async (ev) => {
              const name = ev.target.value.trim();

              if (!name) {
                setInputValue("");
                setMenuItems([]);
                return;
              }

              if (onTyping) {
                onTyping(name, (items: Array<SearchMenuItem>) => {
                  setMenuItems(items);
                });
                return;
              }
              await getProfilesDebounced(name);
            }}
            onFocus={onFocus}
            onBlur={onBlur}
          />
        </div>
        <Combobox.Options
          className={`absolute z-10 w-full bg-white text-black max-h-80 mt-1 rounded-md overflow-y-scroll custom-scrollbar bg-blue-900/20 text-blue-100`}
        >
          <Combobox.Option
            value={false}
            className="pointer-events-none bg-blue-900 text-blue-100"
          >
            {loading && (
              <div className="flex justify-center">
                <ClipLoader
                  color={"white"}
                  loading={loading}
                  size={28}
                  className="my-4"
                />
              </div>
            )}
          </Combobox.Option>
          {!loading &&
            shownItems.map(({ id, profile, text }) => (
              <Combobox.Option key={id} value={id} as={Fragment}>
                {({ active }) => (
                  <li
                    className={`bg-blue-900 text-blue-100 hover:bg-blue-800 ${
                      active && id ? "bg-gray-faint" : ""
                    }`}
                  >
                    <div className="flex p-2 items-center cursor-pointer">
                      {profile && (
                        <MessagingDisplayAvatar
                          publicKey={profile.PublicKeyBase58Check}
                          diameter={50}
                          classNames="mx-0"
                        />
                      )}
                      <span className="ml-4">{text}</span>
                    </div>
                  </li>
                )}
              </Combobox.Option>
            ))}
        </Combobox.Options>
      </Combobox>
    </div>
  );
};
