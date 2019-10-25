# -*- coding: utf-8 -*-
"""TODO(e-carlin): Doc

:copyright: Copyright (c) 2019 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from __future__ import absolute_import, division, print_function
from pykern import pkcollections
from pykern import pkjson
from pykern.pkcollections import PKDict
from pykern.pkdebug import pkdp, pkdc, pkdlog, pkdexc
# TODO(e-carlin): Used to get is_parallel(). Should live in sim_data?
from sirepo import simulation_db
import aenum
import copy
import sirepo.driver
import sirepo.job
import sys
import time
import tornado.locks


class AgentMsg(PKDict):

    async def do(self):
        pkdlog('content={}', sirepo.job.LogFormatter(self.content))
        # TODO(e-carlin): proper error handling
        if self.content.op == sirepo.job.OP_ERROR:
            raise AssertionError('TODO: Handle errors')
        d = sirepo.driver.get_instance_for_agent(self.content.agentId)
        if not d:
            # TODO(e-carlin): handle
            pkdlog('no driver for agent_id={}', self.content.agentId)
            return
        d.set_handler(self.handler)
        d.set_state(self.content)
        i = self.content.get('opId')
        if not i:
            return
        d.ops[i].set_result(self.content)


def init():
    sirepo.job.init()
    sirepo.driver.init()


class Op(PKDict):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._result_set = tornado.locks.Event()
        self._result = None

    async def get_result(self):
        await self._result_set.wait()
        return self._result

    def set_result(self, res):
        self._result = res
        self._result_set.set()


class ServerReq(PKDict):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.agent_dir = self.content.agentDir
        self.driver_kind = sirepo.driver.get_kind(self)
        self.uid = self.content.uid
        self._response = None
        self._response_received = tornado.locks.Event()

    async def do(self):
        c = self.content
        if c.api == 'api_runStatus':
            self.handler.write(await _Job.get_compute_status(self))
            return
        elif c.api == 'api_runSimulation':
            self.handler.write(await _Job.run(self))
            return
        elif c.api == 'api_simulationFrame':
            self.handler.write(await _Job.get_simulation_frame(self))
            return
        raise AssertionError('api={} unkown'.format(c.api))


def terminate():
    sirepo.driver.terminate()


class _Job(PKDict):
    instances = PKDict()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.jid = self._jid_for_req(self.req)
        self.instances[self.jid] = self
        self.res = PKDict(
            backgroundPercentComplete=PKDict(
                percentComplete=0.0,
                frameCount=0,
            ),
            computeJobHash=None,
            lastUpdateTime=None,
            startTime=None,
            state=None,
        )
        self._analysis_lock = tornado.locks.Lock()
        self._req_lock = tornado.locks.Lock()

    @classmethod
    async def get_instance(cls, req):
        """Get a job instance and determine if the computJobHash is same as the req.

        Args:
            req: The incoming request

        Returns:
            tuple: an instance of a job, True if the req computeJobashHash is
            the same as the computeJobHash of the job instance
        """
        # TODO(robnagler) deal with non-in-memory job state (db?)
        self = cls.instances.get(cls._jid_for_req(req))
        if not self:
            # we don't have any record of a compute job with the req jid
            self = cls(req=req)
            await self._req_lock.acquire()
            # populate it's initial state
            d = await sirepo.driver.get_instance_for_job(self)
            o = await d.do_op(
                op=sirepo.job.OP_COMPUTE_STATUS,
                jid=self.jid,
                **self.req.content,
            )
            await o.get_result()
            if self.res.computeJobHash == req.content.computeJobHash:
                # computeJob on disk is same as req
                return self, True
            if self.res.state == sirepo.job.Status.MISSING.value \
                    and self.res.computeJobHash is None:
                # no computeJob on disk so req can be valid by default
                self.res.computeJobHash = req.content.computeJobHash
                return self, True
            # computeJob on disk has different hash than req
            return self, False
        # we have an in memory (and thus on disk) record of a computeJob with the req jid
        await self._req_lock.acquire()
        # TODO(e-carlin): I think this could be problematic in cases where req_lock is released but GUI hasn't been replied to
        self.req = req
        if self.res.computeJobHash == req.content.computeJobHash:
            # computeJob in memory (and thus on disk) hash same hash as req
            return self, True
        assert self.res.computeJobHash is not None
        # computeJob in memory (and thus on disk) has different hash than req
        return self, False

    @classmethod
    async def get_simulation_frame(cls, req):
        self, same_hash = await _Job.get_instance(req)
        if not same_hash:
            raise AssertionError(
                'jid={} with computeJobHash={} unkown'.format(
                    cls._jid_for_req(req),
                    req.content.computeJobHash,
                ))

        async with self._analysis_lock:
            d = await sirepo.driver.get_instance_for_job(self)
            o = await d.do_op(
                op=sirepo.job.OP_ANALYSIS,
                jid=self.jid,
                jobProcessCmd='get_simulation_frame',
                **self.req.content,
            )
            self._req_lock.release()
            return (await o.get_result()).output

    @classmethod
    async def run(cls, req):
        self, same_hash = await _Job.get_instance(req)
        if self.res.state == sirepo.job.Status.RUNNING.value:
            # TODO(e-carlin): Maybe we cancel the job and start the new one?
            self._req_lock.release()
            raise AssertionError(
                'must issue cancel before sim with jid={} can be run'.format(
                    cls._jid_for_req(req))
            )
        if not same_hash or self.res.state in (
                sirepo.job.Status.MISSING.value,
                sirepo.job.Status.CANCELED.value) \
                or self.req.get('forceRun', False):
            # What on disk is old or there is nothing on disk
            d = await sirepo.driver.get_instance_for_job(self)
            # TODO(e-carlin): handle error response from do_op
            self.res.startTime = time.time()
            self.res.lastUpdateTime = time.time()
            self.res.state = sirepo.job.Status.RUNNING.value
            self.res.computeJobHash = self.req.content.computeJobHash
            d = await sirepo.driver.get_instance_for_job(self)
            # OP_RUN is "fast" so don't release self._req_lock().
            # In addition self._get_result() below expects it to be held.
            o = await d.do_op(
                op=sirepo.job.OP_RUN,
                jid=self.jid,
                **self.req.content,
            )
            await o.get_result()
        return await self._get_result(req)

    @classmethod
    async def get_compute_status(cls, req):
        self, same_hash = await _Job.get_instance(req)
        if not same_hash:
            self._req_lock.release()
            return PKDict(state=sirepo.job.Status.MISSING.value)
        return await self._get_result(req)

    async def _get_result(self, req):
        res = PKDict(
            state=self.res.state,
            computeJobHash=self.res.computeJobHash,
            startTime=1 # TODO(e-carlin): figure out when and where this is needed
        )
        if self.res.state == sirepo.job.Status.CANCELED.value \
                or self.res.state == sirepo.job.Status.MISSING.value:
            self._req_lock.release()
            return res
        if self.res.state == sirepo.job.Status.ERROR.value:
            self._req_lock.release()
            # TODO(e-carlin): make sure there is self.res.error
            res.error = self.res.error
            return res
        if self.res.state == sirepo.job.Status.RUNNING.value:
            # TODO(e-carlin): simulation_db.poll_seconds()
            res.nextRequest = PKDict(
                report=req.content.analysisModel,
                computeJobHash=self.res.computeJobHash,
                simulationId=self.req.content.data.simulationId,
                simulationType=req.content.simType,
            )
            res.nextRequestSeconds = simulation_db.poll_seconds(res.nextRequest)
            if simulation_db.is_parallel(res.nextRequest):
                n = self.res.backgroundPercentComplete
                res.update(n)
            self._req_lock.release()
            return res

        if self.res.state == sirepo.job.Status.COMPLETED.value:
            async with self._analysis_lock:
                o = None
                d = await sirepo.driver.get_instance_for_job(self)
                # TODO(e-carlin): This shouldn't be necessary. job_agent should
                # just report the data and we should reply with it. Unless we have
                # no record of the data (ex job supervisor just started and user
                # is requesting data of an already completed job)
                # TODO(e-carlin): Does this break srw? All of the other codes don't
                # do anything with prepare_output_file() for parallel sims
                if simulation_db.is_parallel(PKDict(report=req.content.analysisModel)):
                    o = await d.do_op(
                        op=sirepo.job.OP_ANALYSIS,
                        jid=self.jid,
                        jobProcessCmd='background_percent_complete',
                        isRunning=False,
                        **self.req.content,
                    )
                else:
                    o = await d.do_op(
                        op=sirepo.job.OP_RESULT,
                        jid=self.req.content.analysisJid,
                        **self.req.content,
                    )
                self._req_lock.release()
                r = await o.get_result()
                r = r.output.result if 'result' in r.output else r.output
                res.update(r)
                return res

        raise AssertionError('state={} unrecognized'.format(self.res.state))

    def update_state(self, state):
        # TODO(e-carlin): only some state should be updated
        self.res.update(**state)

    @classmethod
    def _jid_for_req(cls, req):
        """Get the jid (compute or analysis) for a job from a request.
        """
        c = req.content
        if c.api in ('api_runStatus', 'api_runCancel', 'api_runSimulation'):
            return c.computeJid
        if c.api in ('api_simulationFrame',):
            return c.analysisJid
        raise AssertionError('unknown api={} req={}'.format(c.api, req))

    def __repr__(self):
        return f'jid={self.jid} state={self.res.state} compute_hash={self.res.computeJobHash}'
