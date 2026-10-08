import { getPolicyFileUrl } from '@/api/policyApi';

export function policyHasFile(policy) {
  if (!policy) return false;
  if (typeof policy.hasFile === 'boolean') return policy.hasFile;
  return Boolean(policy.fileUrl);
}

export function isPdfPolicy(policy) {
  const fileUrl = policy?.fileUrl || '';
  return fileUrl.toLowerCase().includes('.pdf');
}

export function policyFileUrl(policy) {
  if (!policy?._id) return null;
  return getPolicyFileUrl(policy._id);
}
