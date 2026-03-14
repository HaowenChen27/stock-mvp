import json
import sys
import warnings

warnings.filterwarnings('ignore')

import requests
OrigSession = requests.Session
class NoProxySession(OrigSession):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.trust_env = False
requests.Session = NoProxySession

import akshare as ak


def to_symbol(item):
    market = (item.get('market') or 'SH').upper()
    return f"{market}{item['code']}"


def main():
    payload = json.loads(sys.stdin.read() or '{}')
    symbols = payload.get('symbols', [])
    quotes = []

    for item in symbols:
        try:
            df = ak.stock_individual_spot_xq(symbol=to_symbol(item))
            data = {row['item']: row['value'] for _, row in df.iterrows()}
            quotes.append({
                'code': item['code'],
                'name': data.get('名称', item.get('name', item['code'])),
                'price': float(data.get('现价', 0) or 0),
                'prevClose': float(data.get('昨收', 0) or 0),
                'open': float(data.get('今开', 0) or 0),
                'high': float(data.get('最高', 0) or 0),
                'low': float(data.get('最低', 0) or 0),
                'turnover': float(data.get('成交额', 0) or 0),
                'volume': float(data.get('成交量', 0) or 0),
                'changePct': float(data.get('涨幅', 0) or 0),
                'time': data.get('时间')
            })
        except Exception as e:
            quotes.append({
                'code': item['code'],
                'error': str(e)
            })

    print(json.dumps({'quotes': quotes}, ensure_ascii=False))


if __name__ == '__main__':
    main()
