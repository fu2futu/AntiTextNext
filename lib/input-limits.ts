export const INPUT_LIMITS = {
  chatMessageMax: 1000,
  contactUsernameMax: 50,
  contactContentMin: 10,
  contactContentMax: 2000,
  profileNicknameMin: 2,
  profileNicknameMax: 20,
  listingTitleMax: 80,
  listingDescriptionMax: 100,
  bookRequestTitleMax: 100,
  bookRequestAuthorMax: 100,
  bookRequestCourseMax: 100,
} as const;

export const trimToLimit = (value: string, maxLength: number) =>
  value.length > maxLength ? value.slice(0, maxLength) : value;
