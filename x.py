import h5py
from pykern.pkdebug import pkdp

file = h5py.File('dummy.dat', 'r')
pkdp('\n\n\n file: {} \n\n\n ', file)
