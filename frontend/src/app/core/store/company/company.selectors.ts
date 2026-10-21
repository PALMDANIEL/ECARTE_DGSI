import { createSelector } from '@ngrx/store';
import { AppState } from '..';
export const selectCompanyState = (state: AppState) => state.company;
export const selectAllCompanies = createSelector(selectCompanyState, company => company.companies);
export const selectCompaniesLoading = createSelector(selectCompanyState, company => company.loading);
export const selectCompaniesError = createSelector(selectCompanyState, company => company.error);
