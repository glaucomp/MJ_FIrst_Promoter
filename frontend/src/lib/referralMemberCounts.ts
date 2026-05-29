import { chatterGroupsApi, type Referral } from '../services/api';

/**
 * Merge live chatter-group member counts into referral rows.
 * Uses the same /chatter-groups payload the Chatter Groups page shows, so
 * the Promoters CTA stays in sync even if /my-referrals omits counts (older
 * API) or the promoter's linked group id is stale.
 */
export async function enrichReferralsWithMemberCounts(
  referrals: Referral[],
): Promise<Referral[]> {
  const hasPromoters = referrals.some((r) => r.referredUser);
  if (!hasPromoters) return referrals;

  try {
    const { groups } = await chatterGroupsApi.list();
    const countByGroupId = new Map(
      groups.map((g) => [g.id, g.members?.length ?? 0]),
    );
    const countByPromoterId = new Map<string, number>();
    for (const g of groups) {
      if (g.promoter?.id) {
        countByPromoterId.set(g.promoter.id, g.members?.length ?? 0);
      }
    }

    return referrals.map((r) => {
      const ru = r.referredUser;
      if (!ru) return r;

      const fromGroupId = ru.chatterGroupId
        ? countByGroupId.get(ru.chatterGroupId)
        : undefined;
      const fromPromoter = countByPromoterId.get(ru.id);
      const count = fromPromoter ?? fromGroupId ?? ru.chatterGroupMemberCount ?? 0;

      if (count === (ru.chatterGroupMemberCount ?? 0)) return r;

      return {
        ...r,
        referredUser: { ...ru, chatterGroupMemberCount: count },
      };
    });
  } catch {
    return referrals;
  }
}
