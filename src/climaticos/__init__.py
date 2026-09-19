"""Pacote ETL climático — coleta, tratamento e carga das estações Arable e Davis.

O pipeline segue o padrão **extract → transform → load**:

* ``extract``: clientes HTTP para Arable Cloud API e WeatherLink v2 com retry e backoff.
* ``transform``: conversões de unidades e agregação diária.
* ``load``: merge com o histórico existente e escrita atômica dos CSVs.
* ``pipeline``: orquestra o fluxo completo a partir da CLI (``main.py``).
"""

__version__ = "1.0.0"

__all__ = ["__version__"]