import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { CompanyService } from '../../../features/companies/services/company.service';
import * as CompanyActions from './company.actions';

@Injectable()
export class CompanyEffects {
  private actions$ = inject(Actions);
  private companyService = inject(CompanyService);

  loadCompanies$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CompanyActions.loadCompanies),
      mergeMap(() =>
        this.companyService.getAll().pipe(
          map(companies => CompanyActions.loadCompaniesSuccess({ companies })),
          catchError(error => of(CompanyActions.loadCompaniesFailure({ error: error.error?.message || error.message })))
        )
      )
    )
  );

  createCompany$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CompanyActions.createCompany),
      mergeMap(({ company }) =>
        this.companyService.create(company).pipe(
          map(created => CompanyActions.createCompanySuccess({ company: created })),
          catchError(error => of(CompanyActions.createCompanyFailure({ error: error.error?.message || error.message })))
        )
      )
    )
  );

  updateCompany$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CompanyActions.updateCompany),
      mergeMap(({ id, company }) =>
        this.companyService.update(id, company).pipe(
          map(updated => CompanyActions.updateCompanySuccess({ company: updated })),
          catchError(error => of(CompanyActions.updateCompanyFailure({ error: error.error?.message || error.message })))
        )
      )
    )
  );

  deleteCompany$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CompanyActions.deleteCompany),
      mergeMap(({ id }) =>
        this.companyService.delete(id).pipe(
          map(() => CompanyActions.deleteCompanySuccess({ id })),
          catchError(error => of(CompanyActions.deleteCompanyFailure({ error: error.error?.message || error.message })))
        )
      )
    )
  );
}
