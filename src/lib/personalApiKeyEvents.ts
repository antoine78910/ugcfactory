export const PERSONAL_API_KEY_REQUIRED_EVENT = "personal-api-key-required";

export type PersonalApiKeyRequiredDetail = {
  message?: string;
};

export function dispatchPersonalApiKeyRequired(detail?: PersonalApiKeyRequiredDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<PersonalApiKeyRequiredDetail>(PERSONAL_API_KEY_REQUIRED_EVENT, {
      detail: detail ?? {},
    }),
  );
}
