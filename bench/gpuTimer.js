// GPU time per frame through EXT_disjoint_timer_query_webgl2, so the number is the real render cost whatever
// the display or the engine caps the frame rate at; begin before the frame's GL work, end after it, poll each frame
const gpuTimer =
{
    gl: undefined, ext: undefined, query: undefined, pending: [], samples: [], warmup: 60, count: 300,
    begin(gl)
    {
        if (!gl) return;
        this.gl = gl;
        this.ext ??= gl.getExtension('EXT_disjoint_timer_query_webgl2') || null;
        if (!this.ext || this.query) return;
        this.query = gl.createQuery();
        gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.query);
    },
    end(keep=true) // keep false drops a frame that drew nothing
    {
        if (!this.query) return;
        this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
        keep ? this.pending.push(this.query) : this.gl.deleteQuery(this.query);
        this.query = undefined;
    },
    poll()
    {
        const gl = this.gl;
        while (this.pending.length && gl.getQueryParameter(this.pending[0], gl.QUERY_RESULT_AVAILABLE))
        {
            const query = this.pending.shift(), disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
            const ns = gl.getQueryParameter(query, gl.QUERY_RESULT);
            gl.deleteQuery(query);
            if (disjoint) continue;
            if (this.warmup > 0) --this.warmup;
            else if (this.samples.length < this.count) this.samples.push(ns / 1e6);
        }
    },
    get done() { return this.samples.length >= this.count; },
    get ms() { return +(this.samples.reduce((a, b)=> a + b, 0) / this.samples.length).toFixed(2); },
    get supported() { return this.ext !== null; },
};
