// The user object cached in the KV session record must never carry credential material.
export function toSessionUser(userRow) {
	if (!userRow) return userRow;
	const { password, salt, ...rest } = userRow;
	return rest;
}
