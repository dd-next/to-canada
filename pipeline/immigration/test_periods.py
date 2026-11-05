"""Focused checks for publisher metadata and year-dependent immigration calculations."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path[:0] = [str(Path(__file__).resolve().parent), str(Path(__file__).resolve().parents[1])]
import pandas as pd
import income
import retention
import insights


class PeriodChecks(unittest.TestCase):
    def test_verified_constant_dollar_basis_and_schema_drift(self):
        self.assertEqual(income.price_base_year({'footnote': [{'footnotesEn': 'Income values are adjusted to 2024 constant dollars.'}]}), '2024')
        with self.assertRaises(ValueError):
            income.price_base_year({'footnote': [{'footnotesEn': 'Income values are in current dollars.'}]})
        with self.assertRaises(ValueError):
            income.price_base_year({'footnote': [{'footnotesEn': '2023 constant dollars and 2024 constant dollars'}]})

    def test_new_tax_year_moves_income_cohort_and_price_labels(self):
        df = pd.DataFrame([{'REF_DATE': '2024', 'GEO': 'Canada', 'Immigrant admission category': 'Total, immigrant admission category',
                            'Statistics': 'Median wages, salaries and commissions', 'Admission year': '2019, admission year',
                            'VALUE_NUM': 60000, 'STATUS': '', 'SYMBOL': ''}])
        metadata = {'footnote': [{'footnotesEn': 'Income values are adjusted to 2024 constant dollars.'}]}
        with patch.object(income.taxfilers, 'read_filtered', return_value=df), patch.object(income, 'cube_metadata', return_value=metadata), patch.object(income, 'places', return_value=[]):
            _, series, _, _ = income.build()
        self.assertEqual((income.WAGE_COHORT, income.WAGE_TAXYEAR, income.PRICE_BASE_YEAR), (2019, 2024, '2024'))
        self.assertTrue(any(s['dims']['admissionYear'] == '2019' for s in series))
        self.assertTrue(all(s['dims']['priceBaseYear'] == '2024' for s in series))
        self.assertEqual(max(int(p['t']) for s in series if s['dims']['admissionYear'] == '2019' for p in s['points']), 5)

    def test_new_tax_year_moves_retention_cohort(self):
        df = pd.DataFrame([{'REF_DATE': '2024', 'GEO': 'Canada', 'Immigrant admission category': retention.TOT,
                            'Statistics': 'Retention rate', 'Admission year': '2019, admission year',
                            'VALUE_NUM': 90, 'STATUS': '', 'SYMBOL': ''}])
        with patch.object(retention.mobility, 'read_filtered', return_value=df), patch.object(retention, 'places', return_value=[]):
            _, series, _, _ = retention.build()
        self.assertEqual((retention.COHORT, retention.TAXYEAR), (2019, 2024))
        self.assertEqual(series[0]['points'][-1]['t'], '9')

    def test_insights_do_not_mix_geo_or_period(self):
        rows = [{'placeId': p, 'value': v, 'period': period, 'geo': {'level': geo}} for p, v, period, geo in
                [('city', 100, '2024', 'cma'), ('territory', 900, '2024', 'province'), ('part', 500, '2024', 'cma_part'), ('old', 700, '2023', 'cma')]]
        self.assertEqual(insights.ranked_cmas(rows, '2024'), [('city', 100)])
        with self.assertRaises(ValueError):
            insights.one_period(rows)


if __name__ == '__main__':
    unittest.main()
