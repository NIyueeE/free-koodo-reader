// free-koodo-reader: official account/Pro service removed.
// These stubs keep call sites compiling without any network access.

export const getDeviceName = async (): Promise<string> => {
  return "Desktop";
};

export const loginRegister = async (_service: string, _code: string) => {
  return { code: 404, msg: "disabled" };
};

export const getTempToken = async () => {
  return { code: 200, data: { access_token: "", refresh_token: "" } };
};

export const fetchUserInfo = async () => {
  return { code: 200, data: null };
};

export const updateUserConfig = async (_config: any) => {
  return { code: 200 };
};

export const getUserRequest = async () => {
  return null as any;
};

export const resetUserRequest = () => {
  // no-op
};

export const getOSName = () => {
  return "Desktop";
};

export const detectBrowser = () => {
  return "Desktop";
};

export const getOsVersionNumber = (): string => {
  return "";
};
